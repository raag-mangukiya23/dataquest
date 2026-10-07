"""Bridge between the public PRISM site (site/) and the PRISM engine.

The site speaks its own small contract (site/api.js, originally a Cloudflare Worker):
    input  = {student:{interest, logic, creative, comm, hands, sci}, parent:{priority, budget, risk, minpay,
              mobility, tier, firstGen}, region, scholarship, hyperlocal}
    result = {best, top[3], pci, rho, capacity, parentVec, mobility, tier, firstGen, gaps[], audit[]}
This module validates that input exactly like the Worker did, maps it onto the engine's 19-dimension student
profile and family budget, runs the full engine (51 careers, financial solver, scholarships, conflict index,
market blend, sensitivity), and converts the run back into the shape site/app.js renders.

Mapping notes (shown to users in the audit trail, never hidden):
- The site's battery measures 5 traits. Work values, grit and risk tolerance are not measured, so they are
  set to neutral and marked imputed; the run's confidence drops accordingly.
- Household capacity uses the site's own formula (Rs 1.5 L + 0.30 L per budget point, scaled by settlement
  tier). 40 % is treated as savings and the rest as income the family can direct to education.
"""

from __future__ import annotations

import html
import json
import uuid
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime
from typing import Any

from app.core.dimensions import DIMENSIONS
from app.engine.types import CatalogInput, FamilyInput, StudentInput
from app.schemas.analysis import AnalysisRun, FinancialAssessment, Recommendation

# ---------------------------------------------------------------- the site's vocabulary (site/engine.js)
REGIONS = [
    ("chennai", "Chennai · Tamil Nadu corridor"),
    ("coimbatore", "Coimbatore · Kongu industrial belt"),
    ("bengaluru", "Bengaluru · deep-tech corridor"),
    ("hyderabad", "Hyderabad · genome & semiconductor valley"),
    ("pune", "Pune · manufacturing & auto cluster"),
    ("remote", "Hyper-local / remote-global"),
]
REGION_CODE = {
    "chennai": "IN-TN-CHN",
    "coimbatore": "IN-TN-CBE",
    "bengaluru": "IN-KA-BLR",
    "hyderabad": "IN-TG-HYD",
    "pune": "IN-MH-PUN",
    "remote": None,
}
INTERESTS = {
    "computing", "electronics", "mechatronics", "energy", "biotech", "aerospace",
    "agritech", "fintech", "creative", "climate", "research", "undecided",
}  # fmt: skip
PRIORITIES = {"stability", "roi", "prestige", "passion"}
MOBILITY = {
    "hyperlocal": (0.1, 0.05),
    "intrastate": (0.4, 0.05),
    "panindia": (0.8, 0.1),
    "global": (0.9, 0.7),
}
TIER_CAP = {"tier1": 1.12, "tier2": 1.0, "tier3": 0.82}
TRAITS = ("logic", "creative", "comm", "hands", "sci")
MAX_BODY = 8192

# Which of the site's interest domains each engine career belongs to
DOMAIN_BY_SLUG = {
    "vlsi-engineer": "electronics", "electrical-engineer": "electronics",
    "robotics-engineer": "mechatronics", "mechanical-engineer": "mechatronics",
    "automobile-engineer": "mechatronics", "civil-engineer": "mechatronics",
    "agri-drone-engineer": "agritech", "agronomist": "agritech", "food-technologist": "agritech",
    "environmental-scientist": "climate", "climate-data-analyst": "climate", "solar-energy-engineer": "energy",
    "research-scientist": "research", "computational-biologist": "biotech",
    "aerospace-engineer": "aerospace", "commercial-pilot": "aerospace", "merchant-navy-officer": "aerospace",
}  # fmt: skip
DOMAIN_BY_SECTOR = {
    "computing_ai": "computing", "engineering": "mechatronics", "health_life_sciences": "biotech",
    "design_arts": "creative", "business_finance": "fintech", "law_policy": "research",
    "education_research": "research", "media_communication": "creative", "agri_environment": "agritech",
    "energy_manufacturing": "energy", "aerospace_mobility": "aerospace", "hospitality_services": "creative",
}  # fmt: skip
COLOUR_BY_SECTOR = {
    "computing_ai": "#7c5cff", "engineering": "#38bdf8", "health_life_sciences": "#34d399",
    "design_arts": "#f472b6", "business_finance": "#fbbf24", "law_policy": "#a78bfa",
    "education_research": "#60a5fa", "media_communication": "#fb7185", "agri_environment": "#4ade80",
    "energy_manufacturing": "#f59e0b", "aerospace_mobility": "#22d3ee", "hospitality_services": "#fda4af",
}  # fmt: skip
# The site's battery measures abilities, not interests, so its stated interest domain is the interest signal:
# each domain has a typical RIASEC profile (R, I, A, S, E, C), weighted 70 % against 30 % for the trait proxies.
INTEREST_RIASEC = {
    "computing": (0.5, 0.85, 0.35, 0.3, 0.4, 0.6), "electronics": (0.75, 0.8, 0.3, 0.25, 0.35, 0.55),
    "mechatronics": (0.85, 0.7, 0.35, 0.3, 0.4, 0.45), "energy": (0.75, 0.75, 0.3, 0.35, 0.4, 0.45),
    "biotech": (0.45, 0.85, 0.3, 0.65, 0.3, 0.45), "aerospace": (0.8, 0.8, 0.35, 0.3, 0.4, 0.45),
    "agritech": (0.8, 0.7, 0.3, 0.5, 0.4, 0.4), "fintech": (0.25, 0.6, 0.25, 0.35, 0.8, 0.8),
    "creative": (0.4, 0.4, 0.92, 0.5, 0.5, 0.25), "climate": (0.6, 0.8, 0.4, 0.55, 0.35, 0.4),
    "research": (0.45, 0.92, 0.4, 0.35, 0.25, 0.5),
}  # fmt: skip
RIASEC_DIMS = ("riasec_r", "riasec_i", "riasec_a", "riasec_s", "riasec_e", "riasec_c")
NOT_MEASURED = ("val_security", "val_autonomy", "val_impact", "val_financial", "grit", "risk_tolerance")


class BadInput(ValueError):
    pass


# ---------------------------------------------------------------- validation (mirrors site/api.js)
def _num(v: Any, name: str, lo: float, hi: float) -> int:
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise BadInput(f"{name} must be a number") from None
    if n != n or n in (float("inf"), float("-inf")):
        raise BadInput(f"{name} must be a number")
    return round(min(hi, max(lo, n)))


def _pick(v: Any, name: str, allowed: set[str]) -> str:
    if not isinstance(v, str) or v not in allowed:
        raise BadInput(f"{name} must be one of: {', '.join(sorted(allowed))}")
    return v


def validate_input(raw: Any) -> dict:
    if not isinstance(raw, dict):
        raise BadInput("body must be a JSON object")
    s, p = raw.get("student"), raw.get("parent")
    if not isinstance(s, dict):
        raise BadInput("student vector missing")
    if not isinstance(p, dict):
        raise BadInput("parent vector missing")
    student: dict[str, Any] = {"interest": _pick(s.get("interest"), "student.interest", INTERESTS)}
    for k in TRAITS:
        student[k] = _num(s.get(k), f"student.{k}", 0, 100)
    parent: dict[str, Any] = {"priority": _pick(p.get("priority"), "parent.priority", PRIORITIES)}
    parent["budget"] = _num(p.get("budget"), "parent.budget", 0, 100)
    parent["risk"] = _num(p.get("risk"), "parent.risk", 0, 100)
    parent["minpay"] = _num(p.get("minpay"), "parent.minpay", 3, 24)
    parent["firstGen"] = p.get("firstGen") is True
    parent["mobility"] = p.get("mobility") if p.get("mobility") in MOBILITY else "hyperlocal"
    parent["tier"] = p.get("tier") if p.get("tier") in TIER_CAP else "tier2"
    return {
        "student": student,
        "parent": parent,
        "region": _pick(raw.get("region"), "region", set(REGION_CODE)),
        "scholarship": raw.get("scholarship") is True,
        "hyperlocal": raw.get("hyperlocal") is True,
    }


def validate_battery(body: Any) -> dict:
    if not isinstance(body, dict):
        raise BadInput("body must be an object")
    apt = body.get("aptitude")
    if not isinstance(apt, dict):
        raise BadInput("aptitude is required")
    scores = {}
    for k in TRAITS:
        v = apt.get(k)
        v = v.get("score") if isinstance(v, dict) else v
        if not isinstance(v, int | float) or isinstance(v, bool):
            raise BadInput(f"aptitude.{k} must be a number")
        scores[k] = max(0, min(100, round(v)))

    def count(v: Any) -> int:
        return max(0, min(200, round(v))) if isinstance(v, int | float) and not isinstance(v, bool) else 0

    return {
        "profile": validate_input(body.get("profile")),
        "scores": scores,
        "mean": round(sum(scores.values()) / len(TRAITS)),
        "answered": count(body.get("answered")),
        "total": count(body.get("total")),
    }


# ---------------------------------------------------------------- site input -> engine input
def capacity_lakh(parent: dict) -> float:
    """The site's own household-capacity formula, so both sides describe the same family."""
    return (1.5 + parent["budget"] * 0.30) * TIER_CAP[parent["tier"]]


def to_student(inp: dict) -> StudentInput:
    t = {k: inp["student"][k] / 100 for k in TRAITS}
    v = {
        "riasec_r": t["hands"],
        "riasec_i": 0.6 * t["sci"] + 0.4 * t["logic"],
        "riasec_a": t["creative"],
        "riasec_s": 0.3 + 0.5 * t["comm"],
        "riasec_e": 0.25 + 0.5 * t["comm"],
        "riasec_c": 0.3 + 0.4 * t["logic"],
        "apt_numerical": 0.5 * t["logic"] + 0.5 * t["sci"],
        "apt_verbal": t["comm"],
        "apt_logical": t["logic"],
        "apt_spatial": t["hands"],
        "cog_analytical": 0.7 * t["logic"] + 0.3 * t["sci"],
        "cog_creative": t["creative"],
        "cog_practical": t["hands"],
    }
    profile = INTEREST_RIASEC.get(inp["student"]["interest"])
    if profile:
        for d, target in zip(RIASEC_DIMS, profile, strict=True):
            v[d] = 0.3 * v[d] + 0.7 * target
    vector = {d: round(min(1.0, max(0.0, v.get(d, 0.5))), 4) for d in DIMENSIONS}
    reloc, abroad = MOBILITY[inp["parent"]["mobility"]]
    return StudentInput(
        student_id="site",
        vector=vector,
        reliability={d: (0.0 if d in NOT_MEASURED else 0.75) for d in DIMENSIONS},
        imputed=NOT_MEASURED,
        completeness=round((len(DIMENSIONS) - len(NOT_MEASURED)) / len(DIMENSIONS), 4),
        grade=12,
        region_code=REGION_CODE[inp["region"]],
        state=None,
        willing_to_relocate=1.0 if inp["region"] == "remote" else reloc,
        willing_abroad=abroad,
    )


def to_family(inp: dict) -> FamilyInput:
    p = inp["parent"]
    cap = capacity_lakh(p) * 100_000
    income = max(120_000, int(cap * 0.6 / (4 * 0.15)))  # 60 % of capacity from income over ~4 years
    reloc, abroad = MOBILITY[p["mobility"]]
    return FamilyInput(
        family_id="site",
        annual_income=income,
        income_growth=0.05,
        savings=int(cap * 0.4),
        existing_emi=0,
        dependents=2,
        max_emi=int(0.2 * income / 12),
        loan_tolerance=min(0.9, max(0.1, p["risk"] / 100)),
        risk_appetite=p["risk"] / 100,
        relocation=reloc,
        abroad=abroad,
        time_to_earn_years=5,
        prestige_vs_stability={"stability": "stability", "prestige": "prestige"}.get(
            p["priority"], "balanced"
        ),
    )


# ---------------------------------------------------------------- engine run -> site result
def _lakh(rupees: int | float | None) -> float:
    return round((rupees or 0) / 100_000, 2)


def _clamp(x: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, x))


def _trait_profile(req: dict[str, float]) -> dict[str, int]:
    def m(*ds: str) -> int:
        return round(100 * sum(req.get(d, 0.5) for d in ds) / len(ds))

    return {
        "logic": m("apt_logical", "cog_analytical"),
        "creative": m("riasec_a", "cog_creative"),
        "comm": m("apt_verbal", "riasec_s", "riasec_e"),
        "hands": m("riasec_r", "apt_spatial", "cog_practical"),
        "sci": m("riasec_i", "apt_numerical"),
    }


@dataclass
class _Ctx:
    inp: dict
    cat: CatalogInput
    careers: dict
    pathways: dict
    demand: dict  # (career_id, region_code) -> demand 0..1


def _career(rec: Recommendation, ctx: _Ctx) -> dict:
    c = ctx.careers[rec.career.id]
    f: FinancialAssessment = rec.financial
    path = ctx.pathways.get(f.pathway_id)
    exams = [ctx.cat.exams[x].name for x in (path.entrance_exam_codes if path else []) if x in ctx.cat.exams]
    funds = [s.name for s in f.scholarship_plan]
    if f.loan_scheme:
        funds.append(f.loan_scheme.split(":")[0])
    if not funds:
        funds = ["Education loan via a bank"]
    nat = round(100 * rec.market.demand_index)
    d = {}
    for key, code in REGION_CODE.items():
        got = ctx.demand.get((c.id, code)) if code else None
        d[key] = round(100 * got) if got is not None else nat
    return {
        "id": c.slug,
        "name": c.name,
        "domain": DOMAIN_BY_SLUG.get(c.slug, DOMAIN_BY_SECTOR.get(c.sector, "undecided")),
        "c": COLOUR_BY_SECTOR.get(c.sector, "#7c5cff"),
        "hyperlocal": False,
        "v": _trait_profile(c.requirement_vector),
        "cost": _lakh(f.total_cost),
        "years": f.duration_years,
        "entry": _lakh(f.roi.starting_salary),
        "mid": _lakh(f.roi.salary_year10),
        "vol": round(100 * rec.market.disruption_risk),
        "d": d,
        "exams": exams[:4],
        "funds": funds[:4],
        "pathway": f"{f.pathway_name} · {f.institution_name}",
        "affordability": f.affordability_class.value,
    }


def _scored(rec: Recommendation, ctx: _Ctx) -> dict:
    c = _career(rec, ctx)
    p = ctx.inp["parent"]
    return {
        "composite": round(100 * rec.final_score, 2),
        "fit": round(100 * rec.fit.fit, 2),
        "fin": round(100 * rec.financial.reachability, 2),
        "riskAl": round(_clamp(100 - abs(c["vol"] - p["risk"]) * 1.05, 4, 100), 2),
        "mkt": round(100 * rec.market.market_score, 2),
        "finGap": _lakh(rec.financial.funding_gap),
        "yieldGap": round(max(0.0, p["minpay"] - c["entry"]), 2),
        "roiScore": round(100 * rec.financial.roi.roi_norm, 2),
        "interestMatch": ctx.inp["student"]["interest"] in (c["domain"], "undecided"),
        "confidence": rec.confidence,
        "c": c,
    }


WARN_WORDS = ("competitive", "gap", "Getting in", "scaled", "short", "loan", "below", "infeasible", "stretch")


def _gaps(run: AnalysisRun, best: dict, ctx: _Ctx) -> list[dict]:
    e = html.escape
    out = []
    for line in run.recommendations[0].explanation:
        out.append({"warn": any(w in line for w in WARN_WORDS), "html": e(line)})
    if best["finGap"] > 0:
        out.append({
            "warn": True,
            "html": f"<b>Financial gap of Rs {best['finGap']:.1f} lakh</b> even with a loan. Check: "
            f"{e(', '.join(best['c']['funds'][:3]))}, a government-quota seat or a larger education loan.",
        })  # fmt: skip
    if best["yieldGap"] > 0:
        out.append({
            "warn": True,
            "html": f"<b>Yield mismatch of Rs {best['yieldGap']:.1f} LPA.</b> Starting pay of about Rs "
            f"{best['c']['entry']:.1f} LPA is below the family's Rs {ctx.inp['parent']['minpay']} LPA floor.",
        })  # fmt: skip
    if run.conflict.band.value == "high":
        for d in run.conflict.top_drivers:
            out.append({"warn": True, "html": f"<b>Talk about:</b> {e(d.conversation_prompt)}"})
    stretch = run.buckets.get("stretch_goals", []) if isinstance(run.buckets, dict) else []
    for item in stretch[:2]:
        out.append({"warn": False, "html": f"<b>Stretch goal: {e(item.career_name)}.</b> {e(item.reason)}."})
    out.append({
        "warn": False,
        "html": "<b>What this is based on.</b> The battery measures five traits; work values, grit and risk "
        "tolerance were not measured, so they were set to neutral. Confidence in the top match: "
        f"{round(100 * best['confidence'])} %.",
    })  # fmt: skip
    return out


def _audit(run: AnalysisRun, ctx: _Ctx) -> list[str]:
    w = run.weights
    s = run.sensitivity
    e = html.escape
    lines = [
        "Mapped the five measured traits and the declared interest "
        f"(<b>{e(ctx.inp['student']['interest'])}</b>) onto PRISM's 19-dimension profile; values, grit and risk "
        "tolerance were not measured and were set to neutral.",
        f"Scored all {len(ctx.cat.careers)} careers and {len(ctx.cat.pathways)} course pathways in dataset "
        f"<b>{e(run.reproducibility.dataset_version)}</b> (scoring {e(run.reproducibility.scoring_config_version)}).",
        "Financial solver: inflation-adjusted course cost, household funds, the best scholarship plan, and loan "
        "capacity with CSIS / PM-Vidyalaxmi relief where the family qualifies.",
        f"Parent–student conflict index {round(run.conflict.index)} ({e(run.conflict.band.value)}) from six "
        "dimensions: field, risk, geography, budget, time to first salary, stability vs prestige.",
        f"Final score = fit gate × ({w['fit']:.2f}·fit + {w['market']:.2f}·market + {w['affordability']:.2f}·"
        f"affordability + {w['roi']:.2f}·ROI + {w['family_alignment']:.2f}·family − {w['disruption']:.2f}·"
        "automation risk).",
    ]
    if s:
        lines.append(
            f"Robustness: the top career held first in {round(100 * s.top1_stability)} % of {s.scenarios} "
            "scenarios with the weights changed by ±20 %."
        )
    return lines


def to_site_result(run: AnalysisRun, inp: dict, cat: CatalogInput) -> dict:
    ctx = _Ctx(
        inp=inp,
        cat=cat,
        careers={c.id: c for c in cat.careers},
        pathways={p.id: p for p in cat.pathways},
        demand={(s.career.id, s.region_code): s.demand_index for s in cat.signals},
    )
    top = [_scored(r, ctx) for r in run.recommendations[:3]]
    best = top[0]
    pci = round(run.conflict.index)
    rho = round(1 - 2 * pci / 100, 3)
    family_pick = (run.buckets.get("best_for_family") or [None])[0]
    pv_src = next(
        (r for r in run.recommendations if family_pick and r.career.id == family_pick.career_id), None
    )
    pv_req = _trait_profile(ctx.careers[pv_src.career.id].requirement_vector) if pv_src else best["c"]["v"]
    pull = 0.18 + max(0.0, rho) * 0.22
    parent_vec = [round(_clamp(pv_req[k] + (inp["student"][k] - pv_req[k]) * pull)) for k in TRAITS]
    return {
        "best": best,
        "top": top,
        "pci": pci,
        "rho": rho,
        "capacity": _lakh(run.recommendations[0].financial.family_funds),
        "parentVec": parent_vec,
        "mobility": inp["parent"]["mobility"],
        "tier": inp["parent"]["tier"],
        "firstGen": inp["parent"]["firstGen"],
        "gaps": _gaps(run, best, ctx),
        "audit": _audit(run, ctx),
        "source": "prism-backend",
        "runId": run.run_id,
        "datasetVersion": run.reproducibility.dataset_version,
    }


def score(inp: dict, cat: CatalogInput, today: date, now: datetime | None = None) -> tuple[AnalysisRun, dict]:
    from app.services.analysis import run_analysis

    if not inp["scholarship"]:
        cat = replace(cat, scholarships=[], pathway_scholarships={})
    run = run_analysis(
        to_student(inp), to_family(inp), cat, today=today, now=now or datetime.now(UTC), top_k=10
    )
    return run, to_site_result(run, inp, cat)


def market(region: str, cat: CatalogInput) -> dict:
    if region not in REGION_CODE:
        raise BadInput("unknown region")
    code = REGION_CODE[region]
    demand = {(s.career.id, s.region_code): s.demand_index for s in cat.signals}
    cheapest: dict[str, Any] = {}
    for p in cat.pathways:
        cost = (
            p.tuition_per_year + p.hostel_per_year + p.living_per_year + p.misc_per_year
        ) * p.duration_years
        for cid in p.career_ids:
            if cid not in cheapest or cost < cheapest[cid][0]:
                cheapest[cid] = (cost, p)
    careers = []
    for c in cat.careers:
        bands = cat.salaries.get(c.id, [])
        band = next((b for b in bands if b.region_code == code), bands[0] if bands else None)
        nat = [v for (cid, _), v in demand.items() if cid == c.id]
        dem = demand.get((c.id, code)) if code else None
        dem = dem if dem is not None else (sum(nat) / len(nat) if nat else 0.5)
        cost, p = cheapest.get(c.id, (0, None))
        careers.append({
            "id": c.slug, "name": c.name, "domain": DOMAIN_BY_SLUG.get(c.slug, DOMAIN_BY_SECTOR.get(c.sector)),
            "colour": COLOUR_BY_SECTOR.get(c.sector, "#7c5cff"), "demand": round(100 * dem),
            "cost": _lakh(cost), "years": p.duration_years if p else None,
            "entry": _lakh(band.entry_p50) if band else None, "mid": _lakh(band.mid_p50) if band else None,
            "vol": round(100 * c.automation_risk), "hyperlocal": False,
            "exams": [cat.exams[x].name for x in (p.entrance_exam_codes if p else []) if x in cat.exams],
            "funds": [],
        })  # fmt: skip
    careers.sort(key=lambda x: -x["demand"])
    label = dict(REGIONS)[region]
    return {
        "ok": True,
        "region": {"key": region, "label": label},
        "generatedAt": _iso_now(),
        "careers": careers,
    }


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


def _ms(dt: datetime) -> int:
    return int((dt if dt.tzinfo else dt.replace(tzinfo=UTC)).timestamp() * 1000)


# ---------------------------------------------------------------- storage (memory in mock mode, DB in live mode)
def band_of(pci: int) -> str:
    return "low" if pci < 30 else "moderate" if pci < 60 else "high"


class MemoryStore:
    def __init__(self) -> None:
        self.assessments: dict[str, dict] = {}
        self.battery: list[dict] = []

    def save_assessment(self, inp: dict, result: dict) -> tuple[str, int]:
        sid, now = str(uuid.uuid4()), datetime.now(UTC)
        self.assessments[sid] = {"id": sid, "created_at": now, "input": inp, "result": result}
        return sid, _ms(now)

    def load_assessment(self, sid: str) -> dict | None:
        a = self.assessments.get(sid)
        return a and {
            "id": sid,
            "createdAt": _ms(a["created_at"]),
            "input": a["input"],
            "result": a["result"],
        }

    def save_battery(self, a: dict) -> tuple[str, int]:
        sid, now = str(uuid.uuid4()), datetime.now(UTC)
        self.battery.append({"id": sid, "created_at": now, **a})
        return sid, _ms(now)

    def rows(self) -> tuple[list[dict], list[dict]]:
        ass = [_row(a["id"], a["created_at"], a["input"], a["result"]) for a in self.assessments.values()]
        bat = [_bat_row(b["created_at"], b) for b in self.battery]
        return ass, bat


class DbStore:
    def __init__(self, db) -> None:
        self.db = db

    def save_assessment(self, inp: dict, result: dict) -> tuple[str, int]:
        from app.models.site import SiteAssessment

        r = _row(str(uuid.uuid4()), datetime.now(UTC), inp, result)
        self.db.add(
            SiteAssessment(
                id=r["id"], created_at=r["created_at"], region=r["region"], interest=inp["student"]["interest"],
                priority=inp["parent"]["priority"], composite=r["composite"], pci=r["pci"],
                conflict_band=band_of(r["pci"]), capacity=r["capacity"], fin_gap=r["fin_gap"], top1=r["top"][0],
                top2=r["top"][1] if len(r["top"]) > 1 else None, top3=r["top"][2] if len(r["top"]) > 2 else None,
                dataset_version=result.get("datasetVersion", ""), input_json=inp, result_json=result,
            )
        )  # fmt: skip
        self.db.flush()
        return r["id"], _ms(r["created_at"])

    def load_assessment(self, sid: str) -> dict | None:
        from app.models.site import SiteAssessment

        a = self.db.get(SiteAssessment, sid)
        return a and {
            "id": a.id,
            "createdAt": _ms(a.created_at),
            "input": a.input_json,
            "result": a.result_json,
        }

    def save_battery(self, a: dict) -> tuple[str, int]:
        from app.models.site import SiteBatteryAttempt

        p, s, now = a["profile"], a["scores"], datetime.now(UTC)
        row = SiteBatteryAttempt(
            id=str(uuid.uuid4()), created_at=now, region=p["region"], interest=p["student"]["interest"],
            priority=p["parent"]["priority"], mean_aptitude=a["mean"], answered=a["answered"], total=a["total"],
            profile_json=p, **s,
        )  # fmt: skip
        self.db.add(row)
        self.db.flush()
        return row.id, _ms(now)

    def rows(self) -> tuple[list[dict], list[dict]]:
        from sqlalchemy import select

        from app.models.site import SiteAssessment, SiteBatteryAttempt

        ass = [
            _row(a.id, a.created_at, a.input_json, a.result_json)
            for a in self.db.scalars(
                select(SiteAssessment).order_by(SiteAssessment.created_at.desc()).limit(5000)
            )
        ]
        bat = [
            _bat_row(b.created_at, {"scores": {k: getattr(b, k) for k in TRAITS}, "mean": b.mean_aptitude,
                                    "answered": b.answered, "total": b.total})
            for b in self.db.scalars(select(SiteBatteryAttempt).limit(5000))
        ]  # fmt: skip
        return ass, bat


def _row(sid: str, created: datetime, inp: dict, result: dict) -> dict:
    return {
        "id": sid,
        "created_at": created,
        "region": inp["region"],
        "composite": float(result["best"]["composite"]),
        "pci": int(result["pci"]),
        "capacity": float(result["capacity"]),
        "fin_gap": float(result["best"]["finGap"]),
        "top": [t["c"]["name"] for t in result["top"]],
        "top_ids": [t["c"]["id"] for t in result["top"]],
    }


def _bat_row(created: datetime, b: dict) -> dict:
    return {"created_at": created, **b}


def insights(store) -> dict:
    ass, bat = store.rows()
    n = len(ass)

    def pct(part: int, whole: int) -> float:
        return round(part / whole * 100, 1) if whole else 0

    def counts(key) -> list[tuple[str, int]]:
        out: dict[str, int] = {}
        for a in ass:
            out[key(a)] = out.get(key(a), 0) + 1
        return sorted(out.items(), key=lambda kv: -kv[1])

    bands = {"low": 0, "moderate": 0, "high": 0}
    for a in ass:
        bands[band_of(a["pci"])] += 1
    names = {a["top_ids"][0]: a["top"][0] for a in ass}
    recent = sorted(ass, key=lambda a: a["created_at"], reverse=True)[:8]
    labels = dict(REGIONS)
    nb = len(bat)
    return {
        "ok": True,
        "total": n,
        "avgComposite": round(sum(a["composite"] for a in ass) / n, 1) if n else 0,
        "avgPci": round(sum(a["pci"] for a in ass) / n) if n else 0,
        "affordabilityStrainRate": pct(sum(1 for a in ass if a["fin_gap"] > 0), n),
        "byRegion": [
            {"region": r, "label": labels.get(r, r), "count": c, "share": pct(c, n)}
            for r, c in counts(lambda a: a["region"])[:8]
        ],
        "topCareers": [
            {"id": cid, "name": names[cid], "count": c, "share": pct(c, n)}
            for cid, c in counts(lambda a: a["top_ids"][0])[:6]
        ],
        "conflictBands": bands,
        "recent": [
            {
                "id": a["id"],
                "createdAt": _ms(a["created_at"]),
                "region": a["region"],
                "career": a["top"][0],
                "composite": round(a["composite"]),
                "pci": a["pci"],
            }
            for a in recent
        ],  # fmt: skip
        "battery": {
            "attempts": nb,
            "avgMean": round(sum(b["mean"] for b in bat) / nb) if nb else 0,
            "partial": sum(1 for b in bat if b["answered"] < b["total"]),
            "byDomain": {k: round(sum(b["scores"][k] for b in bat) / nb) if nb else 0 for k in TRAITS},
        },
    }


def dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)
