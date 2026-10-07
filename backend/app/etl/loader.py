"""Load the seed catalog (data/seed/*.json) into the database, as a new dataset version.

Every row is first built as the API's Pydantic model, so provenance rules apply, and the whole catalog
passes the quality gates in app/etl/quality.py before anything is written. If any gate reports an error,
nothing is written and the previous dataset version stays active (fail closed).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.assessment.bank import get_bank, public_id
from app.core.dimensions import DIMENSIONS
from app.engine.config import DEFAULT_CONFIG
from app.etl import quality
from app.ml.prototypes import DOMAIN_PROTOTYPES
from app.models import assessment as am
from app.models import catalog as cm
from app.models.outputs import ScoringConfigRow
from app.schemas.catalog import (
    CareerRef,
    DateStatus,
    Exam,
    ExamSession,
    Institution,
    LocalOpportunity,
    MarketSignal,
    Pathway,
    SalaryBand,
    Scholarship,
)
from app.schemas.common import Provenance

SEED_DIR = Path(__file__).resolve().parents[2] / "data" / "seed"
SEED_AS_OF = date(2026, 9, 30)
REGION_FACTOR = {"metro": 1.0, "tier2": 0.88, "tier3": 0.78, "rural": 0.7, "international": 0.85}
GLOBAL_SECTORS = {
    "computing_ai",
    "health_life_sciences",
    "engineering",
    "aerospace_mobility",
    "energy_manufacturing",
}
ESTIMATE = {
    "source_name": "PRISM curated estimate",
    "as_of": SEED_AS_OF.isoformat(),
    "confidence": 0.5,
    "is_estimate": True,
}


def _read(name: str, key: str, directory: Path = SEED_DIR) -> list[dict[str, Any]]:
    return json.loads((directory / name).read_text(encoding="utf-8"))[key]


def content_hash(directory: Path = SEED_DIR) -> str:
    h = hashlib.sha256()
    for f in sorted(directory.glob("*.json")):
        h.update(f.read_bytes())
    return h.hexdigest()


def requirement_vector(sector: str, overrides: dict[str, float]) -> dict[str, float]:
    return dict(zip(DIMENSIONS, DOMAIN_PROTOTYPES[sector], strict=True)) | overrides


def jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a | b else 0.0


@dataclass
class SeedBundle:
    regions: list[dict]
    pincodes: list[dict]
    careers: list[dict]
    institutions: list[dict]
    pathways: list[dict]
    exams: list[dict]
    scholarships: list[dict]
    local: list[dict]
    loans: list[dict]
    edges: list[tuple[str, str, float, float, str]] = field(default_factory=list)


def read_bundle(directory: Path = SEED_DIR) -> SeedBundle:
    b = SeedBundle(
        regions=_read("regions.json", "regions", directory),
        pincodes=_read("pincodes.json", "pincodes", directory),
        careers=_read("careers.json", "careers", directory),
        institutions=_read("institutions.json", "institutions", directory),
        pathways=_read("pathways.json", "pathways", directory),
        exams=_read("exams.json", "exams", directory),
        scholarships=_read("scholarships.json", "scholarships", directory),
        local=_read("local_opportunities.json", "local_opportunities", directory),
        loans=_read("loan_schemes.json", "loan_schemes", directory),
    )
    skills = {c["slug"]: {s["skill"] for s in c["skills"]} for c in b.careers}
    sector = {c["slug"]: c["sector"] for c in b.careers}
    for a in b.careers:
        scored = []
        for o in b.careers:
            if o["slug"] == a["slug"]:
                continue
            j = jaccard(skills[a["slug"]], skills[o["slug"]])
            if j >= 0.2:
                common = sorted(skills[a["slug"]] & skills[o["slug"]])
                diff = round(
                    min(1.0, 1 - 0.8 * j + (0.0 if sector[a["slug"]] == sector[o["slug"]] else 0.1)), 3
                )
                scored.append((a["slug"], o["slug"], round(j, 3), diff, "Shares " + ", ".join(common[:3])))
        b.edges += sorted(scored, key=lambda e: (-e[2], e[1]))[:4]
    return b


def _prov(d: dict | None) -> Provenance:
    return Provenance(**(d or ESTIMATE))


def validate(b: SeedBundle, today: date) -> quality.AuditReport:
    """Build Pydantic objects (enforcing provenance rules) and run every quality gate."""
    ref = {
        c["slug"]: CareerRef(
            id=c["slug"], slug=c["slug"], name=c["name"], sector=c["sector"], steam_tags=c["steam_tags"]
        )
        for c in b.careers
    }
    regions = {r["code"]: r for r in b.regions}
    inst = {i["key"]: i for i in b.institutions}
    cat = quality.Catalog()
    for c in b.careers:
        for r in b.regions:
            f = (
                REGION_FACTOR[r["type"]]
                if (r["type"] != "international" or c["sector"] in GLOBAL_SECTORS)
                else 0.6
            )
            cat.market_signals.append(
                MarketSignal(
                    career=ref[c["slug"]],
                    region_code=r["code"],
                    period="2026-Q3",
                    demand_index=round(min(1.0, c["demand"] * f), 4),
                    job_velocity=c["velocity"],
                    disruption_risk=c["automation_risk"],
                    trend="rising" if c["velocity"] > 0.08 else "stable",
                    provenance=_prov(None),
                )
            )
            sal = c["salary_lakh"]
            m = r["salary_multiplier"]
            cat.salary_bands.append(
                (
                    c["slug"],
                    SalaryBand(
                        region_code=r["code"],
                        entry_p50=int(sal["entry"] * 1e5 * m),
                        mid_p50=int(sal["mid"] * 1e5 * m),
                        senior_p50=int(sal["senior"] * 1e5 * m),
                        growth_rate=0.08,
                        region_multiplier=m,
                        provenance=_prov(None),
                    ),
                )
            )
    for p in b.pathways:
        i = inst[p["institution"]]
        cat.pathways.append(
            Pathway(
                id=p["key"],
                course=p["course"],
                degree_level=p["degree_level"],
                institution=Institution(
                    id=i["key"],
                    name=i["name"],
                    city=i["city"],
                    state=i["state"],
                    country=regions[i["region_code"]]["country"] if i["region_code"] else "Abroad",
                    tier=i["tier"],
                    ownership=i["ownership"],
                ),
                duration_years=p["duration_years"],
                quota=p["quota"],
                fee_academic_year=p["fee_academic_year"],
                tuition_per_year=p["tuition_per_year"],
                hostel_per_year=p["hostel_per_year"],
                living_per_year=p["living_per_year"],
                misc_per_year=p["misc_per_year"],
                entrance_exam_codes=p["entrance_exam_codes"],
                career_ids=p["careers"],
                course_area=p["course_area"],
                admission_route=p["admission_route"],
                selectivity=p["selectivity"],
                provenance=_prov(None),
            )
        )
    for e in b.exams:
        sessions = [
            ExamSession(
                cycle_year=s["cycle_year"],
                session_no=s["session_no"],
                registration_close=s["registration_close"],
                registration_status=DateStatus(s["registration_status"]),
                exam_start=s["exam_start"],
                exam_end=s["exam_end"],
                exam_date_status=DateStatus(s["exam_date_status"]),
            )
            for s in e["sessions"]
        ]
        first = min((s.exam_start for s in sessions if s.exam_start), default=None)
        cat.exams.append(
            Exam(
                code=e["code"],
                name=e["name"],
                conducting_body=e["conducting_body"],
                level=e["level"],
                frequency=e["frequency"],
                next_window_start=first,
                sessions=sessions,
                eligibility_summary=e["eligibility_summary"],
                official_url=e["official_url"],
                provenance=_prov(e["provenance"]),
            )
        )
    for s in b.scholarships:
        cat.scholarships.append(
            Scholarship(
                id=s["key"],
                name=s["name"],
                provider=s["provider"],
                provider_type=s["provider_type"],
                amount_type=s["amount_type"],
                amount_per_year=s["amount_per_year"],
                year_amounts=s["year_amounts"],
                percent_of_tuition=s["percent_of_tuition"],
                max_years=s["max_years"],
                covers=s["covers"],
                eligibility_rules=s["eligibility_rules"],
                eligibility_summary=s["eligibility_summary"],
                probability=s["probability"],
                stackable=s["stackable"],
                exclusive_group=s["exclusive_group"],
                deadline=s["deadline"],
                deadline_status=DateStatus(s["deadline_status"]),
                self_declared_criteria=s["self_declared_criteria"],
                provenance=_prov(s["provenance"]),
            )
        )
    for o in b.local:
        cat.local_opportunities.append(
            LocalOpportunity(
                id=o["key"],
                title=o["title"],
                problem_statement=o["problem_statement"],
                region_code=o["region_code"],
                district=o["district"],
                pincodes=o["pincodes"],
                steam_tags=o["steam_tags"],
                linked_careers=[ref[c] for c in o["linked_careers"]],
                skills=o["skills"],
                partner_type=o["partner_type"],
                starter_project=o["starter_project"],
                provenance=Provenance(
                    source_name="PRISM curated (needs partner confirmation)",
                    as_of=SEED_AS_OF,
                    confidence=0.6,
                    is_estimate=True,
                ),
            )
        )
    report = quality.audit(cat, today)
    slugs = set(ref)
    for p in b.pathways:
        for c in p["careers"]:
            if c not in slugs:
                report.issues.append(quality.Issue("pathways", p["key"], "unknown_career", "error", c))
    return report


def _provcols(p: dict | None) -> dict[str, Any]:
    pr = _prov(p)
    return {
        "source_name": pr.source_name,
        "source_url": pr.source_url,
        "as_of": pr.as_of,
        "confidence": pr.confidence,
        "is_estimate": pr.is_estimate,
        "verification": pr.verification.value,
        "verified_on": pr.verified_on,
        "evidence": pr.evidence,
    }


def _upsert(db: Session, model, key_col: str, key: str, values: dict[str, Any]):
    row = db.scalar(select(model).where(getattr(model, key_col) == key))
    if row is None:
        row = model(**{key_col: key, **values})
        db.add(row)
    else:
        for k, v in values.items():
            setattr(row, k, v)
    db.flush()
    return row


def load(
    db: Session, today: date, label: str | None = None, directory: Path = SEED_DIR, source: str = "seed"
) -> dict[str, Any]:
    bundle = read_bundle(directory)
    report = validate(bundle, today)
    if report.errors:
        return {
            "status": "failed",
            "errors": [f"{i.dataset}/{i.key}: {i.message}" for i in report.errors],
            "warnings": [f"{i.dataset}/{i.key}: {i.message}" for i in report.warnings],
            "counts": {},
        }

    digest = content_hash(directory)
    label = label or f"{source}-{datetime.now(UTC):%Y%m%d%H%M%S}"
    version = cm.DatasetVersion(label=label, source=source, content_hash=digest, is_active=False)
    db.add(version)
    db.flush()
    vid = version.id

    regions = {
        r["code"]: _upsert(db, cm.Region, "code", r["code"], {k: v for k, v in r.items() if k != "code"})
        for r in bundle.regions
    }
    for p in bundle.pincodes:
        row = db.get(cm.PincodeRegion, p["pincode"]) or cm.PincodeRegion(pincode=p["pincode"])
        row.district, row.region_id = p["district"], regions[p["region_code"]].id
        db.merge(row)

    careers = {}
    for c in bundle.careers:
        careers[c["slug"]] = _upsert(
            db,
            cm.Career,
            "slug",
            c["slug"],
            {
                "name": c["name"],
                "sector": c["sector"],
                "steam_tags": c["steam_tags"],
                "short_description": c["short_description"],
                "typical_entry_education": c["typical_entry_education"],
                "automation_risk": c["automation_risk"],
                "requirement_vector": requirement_vector(c["sector"], c["trait_overrides"]),
                "search_keywords": c["search_keywords"],
            },
        )
    db.execute(delete(cm.CareerSkill))
    db.execute(delete(cm.CareerEdge))
    for c in bundle.careers:
        for s in c["skills"]:
            db.add(
                cm.CareerSkill(
                    career_id=careers[c["slug"]].id,
                    skill=s["skill"],
                    category=s["category"],
                    importance=s["importance"],
                )
            )
    for a, o, j, diff, why in bundle.edges:
        db.add(
            cm.CareerEdge(
                from_career_id=careers[a].id,
                to_career_id=careers[o].id,
                skill_overlap=j,
                transition_difficulty=diff,
                why=why,
            )
        )

    est = _provcols(None)
    for c in bundle.careers:
        for r in bundle.regions:
            f = (
                REGION_FACTOR[r["type"]]
                if (r["type"] != "international" or c["sector"] in GLOBAL_SECTORS)
                else 0.6
            )
            db.add(
                cm.MarketSignal(
                    career_id=careers[c["slug"]].id,
                    region_id=regions[r["code"]].id,
                    period="2026-Q3",
                    demand_index=round(min(1.0, c["demand"] * f), 4),
                    job_velocity=c["velocity"],
                    disruption_risk=c["automation_risk"],
                    dataset_version_id=vid,
                    **est,
                )
            )
            sal, m = c["salary_lakh"], r["salary_multiplier"]
            db.add(
                cm.SalaryBand(
                    career_id=careers[c["slug"]].id,
                    region_id=regions[r["code"]].id,
                    entry_p50=int(sal["entry"] * 1e5 * m),
                    mid_p50=int(sal["mid"] * 1e5 * m),
                    senior_p50=int(sal["senior"] * 1e5 * m),
                    growth_rate=0.08,
                    dataset_version_id=vid,
                    **est,
                )
            )

    inst = {
        i["key"]: _upsert(
            db,
            cm.Institution,
            "name",
            i["name"],
            {
                "city": i["city"],
                "state": i["state"],
                "tier": i["tier"],
                "ownership": i["ownership"],
                "region_id": regions[i["region_code"]].id if i["region_code"] else None,
                "country": "India" if (i["region_code"] or "").startswith("IN") else "Abroad",
            },
        )
        for i in bundle.institutions
    }

    exams = {}
    for e in bundle.exams:
        exams[e["code"]] = _upsert(
            db,
            cm.Exam,
            "code",
            e["code"],
            {
                "name": e["name"],
                "conducting_body": e["conducting_body"],
                "level": e["level"],
                "frequency": e["frequency"],
                "eligibility_summary": e["eligibility_summary"],
                "official_url": e["official_url"],
                "dataset_version_id": vid,
                **_provcols(e["provenance"]),
            },
        )
        db.execute(delete(cm.ExamSession).where(cm.ExamSession.exam_id == exams[e["code"]].id))
        for s in e["sessions"]:
            db.add(
                cm.ExamSession(
                    exam_id=exams[e["code"]].id,
                    cycle_year=s["cycle_year"],
                    session_no=s["session_no"],
                    registration_close=date.fromisoformat(s["registration_close"])
                    if s["registration_close"]
                    else None,
                    registration_status=s["registration_status"],
                    exam_start=date.fromisoformat(s["exam_start"]) if s["exam_start"] else None,
                    exam_end=date.fromisoformat(s["exam_end"]) if s["exam_end"] else None,
                    exam_date_status=s["exam_date_status"],
                )
            )

    pathways = {}
    db.execute(delete(cm.PathwayCareer))
    db.execute(delete(cm.PathwayExam))
    db.execute(delete(cm.PathwayScholarship))
    for p in bundle.pathways:
        pathways[p["key"]] = _upsert(
            db,
            cm.Pathway,
            "key",
            p["key"],
            {
                "institution_id": inst[p["institution"]].id,
                "course": p["course"],
                "degree_level": p["degree_level"],
                "duration_years": p["duration_years"],
                "quota": p["quota"],
                "fee_academic_year": p["fee_academic_year"],
                "tuition_per_year": p["tuition_per_year"],
                "hostel_per_year": p["hostel_per_year"],
                "living_per_year": p["living_per_year"],
                "misc_per_year": p["misc_per_year"],
                "course_area": p["course_area"],
                "admission_route": p["admission_route"],
                "selectivity": p["selectivity"],
                "dataset_version_id": vid,
                **est,
            },
        )
        for c in p["careers"]:
            db.add(cm.PathwayCareer(pathway_id=pathways[p["key"]].id, career_id=careers[c].id))
        for e in p["entrance_exam_codes"]:
            db.add(cm.PathwayExam(pathway_id=pathways[p["key"]].id, exam_id=exams[e].id))

    for s in bundle.scholarships:
        row = _upsert(
            db,
            cm.Scholarship,
            "key",
            s["key"],
            {
                "name": s["name"],
                "provider": s["provider"],
                "provider_type": s["provider_type"],
                "amount_type": s["amount_type"],
                "amount_per_year": s["amount_per_year"],
                "year_amounts": s["year_amounts"],
                "percent_of_tuition": s["percent_of_tuition"],
                "max_years": s["max_years"],
                "covers": s["covers"],
                "eligibility_rules": s["eligibility_rules"],
                "eligibility_summary": s["eligibility_summary"],
                "self_declared_criteria": s["self_declared_criteria"],
                "probability": s["probability"],
                "stackable": s["stackable"],
                "exclusive_group": s["exclusive_group"],
                "deadline": date.fromisoformat(s["deadline"]) if s["deadline"] else None,
                "deadline_status": s["deadline_status"],
                "dataset_version_id": vid,
                **_provcols(s["provenance"]),
            },
        )
        for pk in s["linked_pathways"]:
            db.add(cm.PathwayScholarship(pathway_id=pathways[pk].id, scholarship_id=row.id))

    db.execute(delete(cm.LocalOpportunityCareer))
    for o in bundle.local:
        row = _upsert(
            db,
            cm.LocalOpportunity,
            "key",
            o["key"],
            {
                "region_id": regions[o["region_code"]].id,
                "title": o["title"],
                "problem_statement": o["problem_statement"],
                "district": o["district"],
                "pincodes": o["pincodes"],
                "steam_tags": o["steam_tags"],
                "skills": o["skills"],
                "partner_type": o["partner_type"],
                "starter_project": o["starter_project"],
                "dataset_version_id": vid,
                **_provcols(
                    {
                        "source_name": "PRISM curated (needs partner confirmation)",
                        "as_of": SEED_AS_OF.isoformat(),
                        "confidence": 0.6,
                        "is_estimate": True,
                    }
                ),
            },
        )
        for c in o["linked_careers"]:
            db.add(cm.LocalOpportunityCareer(local_opportunity_id=row.id, career_id=careers[c].id))

    _load_bank(db)
    if not db.scalar(select(ScoringConfigRow).where(ScoringConfigRow.version == DEFAULT_CONFIG.version)):
        db.execute(update(ScoringConfigRow).values(is_active=False))
        db.add(
            ScoringConfigRow(
                version=DEFAULT_CONFIG.version,
                weights=DEFAULT_CONFIG.weights,
                parameters=DEFAULT_CONFIG.as_parameters(),
                is_active=True,
            )
        )

    db.execute(update(cm.DatasetVersion).values(is_active=False))
    version.is_active = True
    counts = {
        "careers": len(bundle.careers),
        "regions": len(bundle.regions),
        "pathways": len(bundle.pathways),
        "exams": len(bundle.exams),
        "scholarships": len(bundle.scholarships),
        "local": len(bundle.local),
        "market_signals": len(bundle.careers) * len(bundle.regions),
        "edges": len(bundle.edges),
    }
    version.counts = counts
    db.flush()
    return {
        "status": "completed",
        "dataset_version": label,
        "counts": counts,
        "warnings": [f"{i.dataset}/{i.key}: {i.message}" for i in report.warnings],
    }


def _load_bank(db: Session) -> None:
    bank = get_bank()
    for inst in bank.instruments.values():
        row = db.scalar(
            select(am.AssessmentInstrument).where(
                am.AssessmentInstrument.code == inst.code, am.AssessmentInstrument.version == inst.version
            )
        )
        if row is None:
            row = am.AssessmentInstrument(
                code=inst.code, version=inst.version, name=inst.name, published_at=datetime.now(UTC)
            )
            db.add(row)
            db.flush()
            for n, item in enumerate(inst.items, 1):
                db.add(
                    am.Question(
                        instrument_id=row.id,
                        bank_id=item.id,
                        public_id=public_id(item.id),
                        dimension=item.dimension,
                        type="mcq" if item.is_mcq else "likert5",
                        prompt=item.prompt,
                        options=[o.model_dump() for o in item.options] if item.options else None,
                        correct_key=item.answer,
                        difficulty=item.difficulty,
                        reverse_scored=item.reverse,
                        display_order=n,
                    )
                )
    db.flush()
