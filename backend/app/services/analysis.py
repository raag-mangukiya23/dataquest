"""Assembles a full analysis run from engine inputs. Used by both MOCK_MODE and live mode, so the numbers
are computed the same way everywhere; only where the inputs come from differs."""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from dataclasses import asdict, replace
from datetime import date, datetime

from app.core.config import ENGINE_VERSION
from app.core.dimensions import APTITUDE, RIASEC, VECTOR_SPEC_VERSION
from app.engine import conflict as conflict_engine
from app.engine import eligibility, finance, fit, market, reports, scoring
from app.engine.config import CAREER_ENTRY_GATES, DEFAULT_CONFIG, ScoringConfig
from app.engine.freshness import FRESHNESS_CONFIDENCE, freshness_status, worst
from app.engine.types import CatalogInput, FamilyInput, StudentInput
from app.etl.sources import DATASETS
from app.ml.predictor import predict_domain_fit
from app.schemas.analysis import (
    AnalysisRun,
    CompositeScores,
    DataQuality,
    DataTrust,
    FamilyFitDetail,
    FinancialAssessment,
    Recommendation,
    Reproducibility,
    ScoreComponent,
    TrustInput,
    WhatIfOverrides,
)
from app.schemas.catalog import CareerDetail, LocalOpportunity, Pathway, Scholarship
from app.schemas.common import AffordabilityClass, CareerRef, Provenance, VerificationStatus
from app.schemas.reports import Roadmap, SwotReport

_NS = uuid.UUID("0c7b8f3e-58a4-4c55-a1f7-2f0f6d7d9e11")
CHECKED = (VerificationStatus.VERIFIED, VerificationStatus.SECONDARY)


def input_hash(
    student: StudentInput, family: FamilyInput, cfg: ScoringConfig, cat: CatalogInput, today: date
) -> str:
    payload = {
        "student": asdict(student),
        "family": asdict(family),
        "config": asdict(cfg),
        "dataset": cat.dataset_version,
        "today": today.isoformat(),
        "careers": sorted(c.id for c in cat.careers),
    }
    return "sha256:" + hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def facts(student: StudentInput, family: FamilyInput, p: Pathway) -> dict:
    return {
        "annual_income": family.annual_income,
        "recent_score_pct": student.recent_score_pct,
        "state": student.state,
        "grade": student.grade,
        "course_area": p.course_area,
        "admission_route": p.admission_route,
    }


def eligible_scholarships(
    p: Pathway, cat: CatalogInput, student: StudentInput, family: FamilyInput, want: bool | None = True
) -> list[Scholarship]:
    """Scholarships whose rules evaluate to `want` (True = eligible, None = depends on facts we don't have)."""
    linked = set(cat.pathway_scholarships.get(p.id, []))
    out = []
    for s in cat.scholarships:
        if s.self_declared_criteria:
            continue
        if s.provider_type == "institution" and s.id not in linked:
            continue
        verdict, _ = eligibility.evaluate(s.eligibility_rules, facts(student, family, p))
        if verdict is want:
            out.append(s)
    return out


def _trust(slug_inputs: list[tuple[str, str, Provenance]], today: date) -> DataTrust:
    checked = [r for r in slug_inputs if r[2].verification in CHECKED]
    share = round(len(checked) / len(slug_inputs), 4) if slug_inputs else 0.0
    fresh = worst([freshness_status(p.as_of, today, DATASETS[ds].cadence_days) for _, ds, p in slug_inputs])
    unchecked = [n for n, _, p in slug_inputs if p.verification not in CHECKED]
    note = f"{len(checked)} of {len(slug_inputs)} inputs checked against published sources."
    if unchecked:
        note += " Still estimates: " + "; ".join(unchecked) + "."
    return DataTrust(
        verified_share=share,
        freshness=fresh,
        oldest_as_of=min(p.as_of for _, _, p in slug_inputs).isoformat()
        if slug_inputs
        else today.isoformat(),
        inputs=[
            TrustInput(
                name=n,
                verification=p.verification,
                is_estimate=p.is_estimate,
                as_of=p.as_of.isoformat(),
                source_name=p.source_name,
            )
            for n, _, p in slug_inputs
        ],
        note=note,
    )


def _ref(c: CareerDetail) -> CareerRef:
    return CareerRef(id=c.id, slug=c.slug, name=c.name, sector=c.sector, steam_tags=c.steam_tags)


def _local_for(student: StudentInput, cat: CatalogInput) -> list[LocalOpportunity]:
    district = None
    for o in cat.local_opportunities:
        if student.region_code and o.region_code == student.region_code:
            district = district or o.district
    return [o for o in cat.local_opportunities if o.region_code == student.region_code] if district else []


def run_analysis(
    student: StudentInput,
    family: FamilyInput,
    cat: CatalogInput,
    *,
    today: date,
    now: datetime,
    cfg: ScoringConfig = DEFAULT_CONFIG,
    kind: str = "baseline",
    parent_run_id: str | None = None,
    run_id: str | None = None,
    full_conflict: bool = True,
    top_k: int = 10,
) -> AnalysisRun:
    import time

    t0 = time.perf_counter()
    weights = cfg.weights
    h = input_hash(student, family, cfg, cat, today)
    run_id = run_id or str(uuid.uuid5(_NS, f"{kind}:{h}"))
    careers = {c.id: c for c in cat.careers}
    by_career: dict[str, list[Pathway]] = {}
    for p in cat.pathways:
        for cid in p.career_ids:
            by_career.setdefault(cid, []).append(p)
    rweights = market.region_weights(student, family, cat.regions)
    prediction = predict_domain_fit(student.vector)
    ml_scores = prediction["scores"] if prediction["source"] == "ml" else None
    mean_rel = sum(student.reliability.get(d, 0.0) for d in student.vector) / max(1, len(student.vector))
    # Missing answers and careless answers (identical, very fast or contradictory) both make results less certain
    dq_penalty = round(min(0.6, 0.5 * (1 - student.completeness) + 0.5 * max(0.0, 0.7 - mean_rel)), 4)
    local = _local_for(student, cat)
    local_career_ids = {c.id for o in local for c in o.linked_careers}

    recs: list[Recommendation] = []
    views: list[conflict_engine.CareerView] = []
    stretch_reasons: dict[str, str] = {}
    for c in cat.careers:
        options = by_career.get(c.id, [])
        if not options:
            continue
        f = fit.compute_fit(
            student.vector, c.requirement_vector, ml_scores.get(c.sector) if ml_scores else None, cfg.ml_alpha
        )
        bands = cat.salaries.get(c.id, [])
        gate_p, gate_why = CAREER_ENTRY_GATES.get(c.slug, (1.0, ""))
        assessed: list[tuple[FinancialAssessment, Pathway, list[Scholarship]]] = []
        for p in options:
            elig = eligible_scholarships(p, cat, student, family)
            assessed.append((finance.assess(p, family, student, elig, bands, cfg, today, gate_p), p, elig))
        assessed.sort(key=lambda t: (-t[0].reachability, -t[0].roi.roi_norm, t[0].total_cost))
        primary, p_primary, _ = assessed[0]
        mkt = market.blend(c.id, cat.signals, rweights, c.automation_risk, today)
        accept = conflict_engine.acceptance(c, family, careers)
        raw = {
            ScoreComponent.FIT: f.fit,
            ScoreComponent.MARKET: mkt.market_score,
            ScoreComponent.AFFORDABILITY: primary.reachability,
            ScoreComponent.ROI: primary.roi.roi_norm,
            ScoreComponent.FAMILY_ALIGNMENT: accept,
            ScoreComponent.DISRUPTION: mkt.disruption_risk,
        }
        final = scoring.final_score(raw, weights)
        sig = next(
            (
                s
                for code in mkt.regions_considered
                for s in cat.signals
                if s.career.id == c.id and s.region_code == code
            ),
            None,
        )
        trust_rows: list[tuple[str, str, Provenance]] = []
        if sig:
            trust_rows.append(("market demand", "market_signals", sig.provenance))
        if bands:
            trust_rows.append(("salary band", "salary_bands", bands[0].provenance))
        trust_rows.append((f"fees: {p_primary.course}", "pathways", p_primary.provenance))
        plan_ids = {s.scholarship_id for s in primary.scholarship_plan}
        trust_rows += [
            (f"scholarship: {s.name}", "scholarships", s.provenance)
            for s in cat.scholarships
            if s.id in plan_ids
        ]
        trust_rows += [
            (f"exam dates: {cat.exams[code].name}", "exams", cat.exams[code].provenance)
            for code in p_primary.entrance_exam_codes
            if code in cat.exams
        ]
        trust = _trust(trust_rows, today)
        conf = round(
            cfg.base_model_confidence
            * (0.7 + 0.3 * trust.verified_share)
            * FRESHNESS_CONFIDENCE[trust.freshness]
            * (1 - dq_penalty)
            * (0.8 + 0.2 * mean_rel),
            4,
        )
        half = 0.04 + 0.08 * (1 - trust.verified_share) + 0.04 * (1 - mean_rel)
        reasons = [
            f"Strong match on {', '.join(fit_label(d) for d in f.top_matching_dimensions)}."
            if f.top_matching_dimensions
            else f"Overall fit with your profile: {f.fit:.0%}.",
            f"{primary.pathway_name} at {primary.institution_name} is "
            f"{primary.affordability_class.value.replace('_', '-')} for your family "
            f"(about Rs {primary.total_cost:,} in total).",
            f"Demand outlook {mkt.market_score:.0%}; automation risk {mkt.disruption_risk:.0%}.",
        ]
        if primary.admission_chance < 0.6:
            reasons.append(
                f"Seats on this route are very competitive: estimated admission chance about "
                f"{primary.admission_chance:.0%} with your current scores (estimate)."
            )
        gate = scoring.fit_gate(f.fit)
        if gate < 1:
            reasons.insert(
                1,
                f"Overall score scaled to {gate:.0%} because the match with your profile is only {f.fit:.0%} "
                "(full weight from 65 %): cheap fees or high pay alone should not push a poor fit up the list.",
            )
        if gate_p < 1:
            reasons.append(
                f"Getting in is the hard part: {gate_why} (estimate). Expected earnings assume about a "
                f"{gate_p:.0%} chance, otherwise a typical graduate salary."
            )
        if f.gaps:
            reasons.append(
                f"Biggest gap: {f.gaps[0].label.lower()} ({f.gaps[0].gap:.0%} below the usual level)."
            )
        if primary.affordability_class is AffordabilityClass.INFEASIBLE:
            stretch_reasons[c.id] = _stretch_reason(assessed, family, student, cat, bands, cfg, today)
        recs.append(
            Recommendation(
                rank=1,
                career=_ref(c),
                final_score=final,
                confidence=conf,
                ci_low=round(max(0.0, final - half), 4),
                ci_high=round(min(1.0, final + half), 4),
                contributions=scoring.contributions(raw, weights),
                fit=f,
                market=mkt,
                financial=primary,
                alternative_pathways=[a for a, _, _ in assessed[1:3]],
                family=FamilyFitDetail(
                    student_fit=f.fit,
                    parent_acceptance=accept,
                    bridge_score=round(scoring._hm(f.fit, accept), 4),
                ),
                data_trust=trust,
                buckets=[],
                explanation=reasons,
            )
        )
        own = primary.family_funds + primary.scholarship_expected
        views.append(
            conflict_engine.CareerView(
                career=_ref(c),
                fit=f.fit,
                acceptance=accept,
                cheapest_cost=min(a.total_cost for a, _, _ in assessed),
                own_funds=own,
                years_to_earn=finance.years_until_course(student.grade, today) + p_primary.duration_years,
            )
        )

    recs.sort(key=lambda r: (-r.final_score, r.career.id))
    for i, r in enumerate(recs, 1):
        r.rank = i
    top_fit_ids = {r.career.id for r in sorted(recs, key=lambda r: -r.fit.fit)[:3]}
    edge_targets = {
        e.to_id
        for e in cat.edges
        if e.from_id in top_fit_ids
        and careers.get(e.to_id)
        and careers.get(e.from_id)
        and careers[e.to_id].sector != careers[e.from_id].sector
    }
    favoured = top_fit_ids | {p.career_id for p in family.preferences if p.career_id}
    gem_ids = (local_career_ids | edge_targets) - favoured
    bkts = scoring.buckets(recs, gem_ids, stretch_reasons, {r.career.id for r in recs[:top_k]})
    for r in recs:
        r.buckets = [b for b, items in bkts.items() if any(it.career_id == r.career.id for it in items)]
    report = conflict_engine.compute(student, family, views, cfg.conflict_weights, full_conflict)
    seed = int(h.split(":")[1][:8], 16)
    sens = scoring.sensitivity(
        [
            scoring.Scored(r.career.id, r.career.name, {c.component: c.raw_value for c in r.contributions})
            for r in recs
        ],
        weights,
        cfg.sensitivity_perturbation,
        cfg.sensitivity_scenarios,
        seed,
    )
    shown = recs[:top_k]
    duration_ms = round((time.perf_counter() - t0) * 1000, 1)
    return AnalysisRun(
        run_id=run_id,
        student_id=student.student_id,
        family_id=family.family_id,
        kind=kind,
        parent_run_id=parent_run_id,
        created_at=now,
        duration_ms=duration_ms,
        reproducibility=Reproducibility(
            engine_version=ENGINE_VERSION,
            scoring_config_version=cfg.version,
            vector_spec_version=VECTOR_SPEC_VERSION,
            input_hash=h,
            data_as_of=cat.data_as_of.isoformat(),
            dataset_version=cat.dataset_version,
            latest_dataset_version=cat.latest_dataset_version,
            is_outdated=cat.dataset_version != cat.latest_dataset_version,
            family_finance_version=family.finance_version,
            ml_model_version=prediction["model_version"] if prediction["source"] == "ml" else None,
        ),
        data_quality=DataQuality(
            completeness=student.completeness,
            imputed_fields=list(student.imputed),
            confidence_penalty=dq_penalty,
            warnings=[
                f"{fit_label(d).capitalize()}: too few items answered, so it was set to the neutral 0.5."
                for d in student.imputed
            ]
            + [quality_warning(x) for x in student.quality_flags],
        ),
        student_vector=student.vector,
        composite_scores=composite(student, recs, report.index),
        weights=dict(weights),
        recommendations=shown,
        buckets=bkts,
        conflict=report,
        sensitivity=sens,
        links={
            "self": f"/api/v1/analysis/runs/{run_id}",
            "swot": f"/api/v1/analysis/runs/{run_id}/swot",
            "roadmap": f"/api/v1/analysis/runs/{run_id}/roadmap?career_id={recs[0].career.id}"
            if recs
            else "",
            "what_if": f"/api/v1/analysis/runs/{run_id}/what-if",
            "conflict": f"/api/v1/analysis/runs/{run_id}/conflict",
        },
    )


def _stretch_reason(
    assessed,
    family: FamilyInput,
    student: StudentInput,
    cat: CatalogInput,
    bands,
    cfg: ScoringConfig,
    today: date,
) -> str:
    """Say what could make an unaffordable career reachable, instead of silently dropping it."""
    better = next(
        (a for a, _, _ in assessed[1:] if a.affordability_class is not AffordabilityClass.INFEASIBLE), None
    )
    if better:
        return f"Reachable through {better.pathway_name} ({better.quota} quota)"
    best_gap, best_names = None, ""
    for fa, p, elig in assessed:
        maybe = eligible_scholarships(p, cat, student, family, want=None)
        hopeful = finance.assess(p, family, student, [*elig, *maybe], bands, cfg, today) if maybe else fa
        names = ", ".join(s.name for s in maybe[:2])
        if maybe and hopeful.affordability_class is not AffordabilityClass.INFEASIBLE:
            return (
                f"Could become {hopeful.affordability_class.value.replace('_', '-')} if you qualify for "
                f"{names}; check the eligibility"
            )
        if best_gap is None or hopeful.funding_gap < best_gap:
            best_gap, best_names = hopeful.funding_gap, names
    check = f"check {best_names}, " if best_names else "look for "
    return (
        f"About Rs {best_gap or 0:,} short even with a loan; {check}merit scholarships, government-quota "
        "seats and a larger education loan"
    )


FAMILY_MONEY_FIELDS = (
    "family_funds",
    "loan_capacity",
    "loan_required",
    "monthly_emi",
    "burden_ratio",
    "funding_gap",
)
_SHORT_BY = re.compile(r"About Rs [\d,]+ short even with a loan")


def hide_family_money(run: AnalysisRun) -> AnalysisRun:
    """Student view without the family's consent: drop figures that reveal savings, income or loan size.

    Costs, scholarships, affordability classes and ROI stay: they describe the course, not the family."""

    def fa(x: FinancialAssessment) -> FinancialAssessment:
        return x.model_copy(update=dict.fromkeys(FAMILY_MONEY_FIELDS))

    recs = [
        r.model_copy(
            update={
                "financial": fa(r.financial),
                "alternative_pathways": [fa(a) for a in r.alternative_pathways],
            }
        )
        for r in run.recommendations
    ]
    buckets = {
        k: [
            i.model_copy(update={"reason": _SHORT_BY.sub("Still short of funds even with a loan", i.reason)})
            for i in v
        ]
        for k, v in run.buckets.items()
    }
    return run.model_copy(update={"recommendations": recs, "buckets": buckets})


QUALITY_WARNINGS = {
    "straight_lining": "Many answers in a section were identical, so these results are less reliable. Retaking "
    "that section carefully will make them more accurate.",
    "speeding": "Several answers came very quickly, so these results are less reliable. Taking a little more "
    "time will make them more accurate.",
    "incomplete": "Some sections were left unfinished; the missing traits were set to neutral.",
}


def quality_warning(flag: str) -> str:
    if flag.startswith("contradictory_answers:"):
        return (
            f"Some answers about {fit_label(flag.split(':', 1)[1])} contradicted each other, so that trait is "
            "less reliable."
        )
    return QUALITY_WARNINGS.get(flag, f"Questionnaire check: {flag.replace('_', ' ')}.")


def fit_label(dim: str) -> str:
    from app.core.dimensions import DIMENSION_LABELS

    return DIMENSION_LABELS[dim].split(" (")[0].lower()


def composite(student: StudentInput, recs: list[Recommendation], conflict_index: float) -> CompositeScores:
    v = student.vector
    apt = sum(v[d] for d in APTITUDE) / len(APTITUDE)
    riasec = sorted((v[d] for d in RIASEC), reverse=True)
    clarity = min(1.0, (sum(riasec[:3]) / 3 - sum(riasec[3:]) / 3) / 0.5)
    fin = sum(r.financial.affordability for r in recs) / len(recs) if recs else 0.0
    mkt = sum(r.market.market_score for r in recs[:5]) / max(1, min(5, len(recs)))
    readiness = 0.35 * apt + 0.2 * clarity + 0.25 * fin + 0.2 * (1 - conflict_index / 100)
    return CompositeScores(
        overall_readiness=round(100 * readiness, 1),
        aptitude_index=round(100 * apt, 1),
        interest_clarity=round(100 * clarity, 1),
        financial_capacity=round(100 * fin, 1),
        family_alignment=round(100 - conflict_index, 1),
        market_outlook=round(100 * mkt, 1),
    )


def apply_overrides(
    student: StudentInput, family: FamilyInput, cfg: ScoringConfig, o: WhatIfOverrides
) -> tuple[StudentInput, FamilyInput, ScoringConfig]:
    fam = replace(
        family,
        savings=o.allocatable_savings if o.allocatable_savings is not None else family.savings,
        annual_income=o.annual_income if o.annual_income is not None else family.annual_income,
        max_emi=o.max_affordable_emi if o.max_affordable_emi is not None else family.max_emi,
        loan_tolerance=o.loan_tolerance if o.loan_tolerance is not None else family.loan_tolerance,
        risk_appetite=o.risk_appetite if o.risk_appetite is not None else family.risk_appetite,
        relocation=o.relocation_willingness if o.relocation_willingness is not None else family.relocation,
        abroad=o.abroad_willingness if o.abroad_willingness is not None else family.abroad,
        preferred_regions=tuple(o.preferred_regions)
        if o.preferred_regions is not None
        else family.preferred_regions,
    )
    new_cfg = cfg.with_weights({k.value: v for k, v in o.weights.items()}) if o.weights else cfg
    return student, fam, new_cfg


def swot_for(run: AnalysisRun, student: StudentInput, cat: CatalogInput, career_id: str | None) -> SwotReport:
    rec = next((r for r in run.recommendations if r.career.id == career_id), None) if career_id else None
    return reports.swot(run, student, rec, cat.signals, _local_for(student, cat))


def roadmap_for(
    run: AnalysisRun, student: StudentInput, cat: CatalogInput, career_id: str | None, today: date
) -> Roadmap:
    rec = next((r for r in run.recommendations if r.career.id == career_id), run.recommendations[0])
    careers = {c.id: c for c in cat.careers}
    local = [o for o in _local_for(student, cat) if any(c.id == rec.career.id for c in o.linked_careers)]
    plan_b_ids = [e.to_id for e in cat.edges if e.from_id == rec.career.id] or [
        r.career.id
        for r in sorted(run.recommendations, key=lambda r: -r.fit.fit)
        if r.career.id != rec.career.id
    ]
    plan_b = [_ref(careers[i]) for i in plan_b_ids if i in careers][:3]
    return reports.roadmap(
        run,
        rec,
        student,
        careers[rec.career.id],
        {p.id: p for p in cat.pathways},
        cat.exams,
        local,
        plan_b,
        today,
    )
