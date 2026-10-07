"""Turn the fixture world into schema objects. Derived numbers (costs, affordability, final
scores, conflict index, ranks) are computed here so the fixtures are internally consistent.
The production formulas live in app/engine (Phase 4-5); these are deliberately simple mirrors.
"""

import hashlib
import json
import math
from datetime import date, timedelta

from app.core.clock import today as clock_today
from app.core.config import ENGINE_VERSION
from app.core.dimensions import DIMENSION_LABELS, DIMENSIONS, RIASEC, VECTOR_SPEC_VERSION
from app.engine.freshness import FRESHNESS_CONFIDENCE, freshness_status, worst
from app.etl.quality import Catalog
from app.etl.sources import DATASETS
from app.ml.prototypes import DOMAIN_PROTOTYPES
from app.mocks import persona
from app.mocks import world as w
from app.schemas.analysis import (
    AnalysisRun,
    BridgeCareer,
    BucketItem,
    CompositeScores,
    ConflictDimension,
    ConflictDriver,
    ConflictReport,
    Contribution,
    DataQuality,
    DataTrust,
    FamilyFitDetail,
    FinancialAssessment,
    FitDetail,
    MarketDetail,
    RankChange,
    Recommendation,
    Reproducibility,
    RoiDetail,
    ScholarshipPick,
    ScoreComponent,
    SensitivityReport,
    TraitGap,
    TrustInput,
)
from app.schemas.catalog import (
    AmountType,
    CareerAlternative,
    CareerDetail,
    CareerSkill,
    CareerSummary,
    DateStatus,
    EligibilityCheck,
    Exam,
    ExamSession,
    Institution,
    LocalOpportunity,
    MarketSignal,
    Pathway,
    Region,
    SalaryBand,
    Scholarship,
    ScholarshipMatch,
)
from app.schemas.common import (
    AffordabilityClass,
    Bucket,
    CareerRef,
    ConflictBand,
    Provenance,
    VerificationStatus,
)

EDU_INFLATION = 0.08
LOAN_RATE = 0.10
LOAN_MONTHS = 120

EST = Provenance(
    source_name="PRISM curated estimate (mock fixture)",
    source_url=None,
    as_of=w.DATA_AS_OF,
    confidence=0.5,
    is_estimate=True,
)


# ---------------------------------------------------------------- careers / catalog
def career_ref(slug: str) -> CareerRef:
    row = next(c for c in w.CAREERS if c[0] == slug)
    return CareerRef(id=w.sid("career", slug), slug=slug, name=row[1], sector=row[2], steam_tags=row[3])


def career_summary(slug: str) -> CareerSummary:
    s, name, sector, tags, edu, risk, desc = next(c for c in w.CAREERS if c[0] == slug)
    return CareerSummary(
        id=w.sid("career", s),
        slug=s,
        name=name,
        sector=sector,
        steam_tags=tags,
        short_description=desc,
        typical_entry_education=edu,
        automation_risk=risk,
        national_demand_index=w.SCORES[s][1],
    )


def requirement_vector(slug: str) -> dict[str, float]:
    sector = career_ref(slug).sector
    return dict(zip(DIMENSIONS, DOMAIN_PROTOTYPES[sector], strict=True))


_SALARY = {  # slug -> (entry, mid, senior) annual CTC in INR, metro India, illustrative
    "data-scientist": (800_000, 2_000_000, 4_000_000),
    "biomedical-engineer": (450_000, 1_100_000, 2_200_000),
    "computational-biologist": (600_000, 1_400_000, 2_800_000),
    "robotics-engineer": (550_000, 1_300_000, 2_600_000),
    "agri-drone-engineer": (400_000, 900_000, 1_800_000),
    "ux-designer": (700_000, 1_800_000, 3_500_000),
    "doctor-mbbs": (900_000, 1_800_000, 3_600_000),
}

_SKILLS = {
    "data-scientist": [
        ("Python", 0.9, "technical"),
        ("Statistics", 0.9, "technical"),
        ("SQL", 0.7, "technical"),
        ("Machine learning", 0.8, "technical"),
        ("Data storytelling", 0.6, "soft"),
    ],
    "biomedical-engineer": [
        ("Electronics", 0.8, "technical"),
        ("Human physiology", 0.7, "domain"),
        ("CAD", 0.6, "technical"),
        ("Regulatory standards", 0.5, "domain"),
    ],
    "computational-biologist": [
        ("Python", 0.8, "technical"),
        ("Molecular biology", 0.9, "domain"),
        ("Statistics", 0.8, "technical"),
        ("Machine learning", 0.6, "technical"),
    ],
    "robotics-engineer": [
        ("Embedded C", 0.8, "technical"),
        ("Control systems", 0.8, "technical"),
        ("CAD", 0.7, "technical"),
        ("Python", 0.6, "technical"),
    ],
    "agri-drone-engineer": [
        ("Drone operation", 0.8, "technical"),
        ("GIS", 0.7, "technical"),
        ("Agronomy", 0.7, "domain"),
        ("Python", 0.5, "technical"),
    ],
    "ux-designer": [
        ("User research", 0.9, "domain"),
        ("Prototyping", 0.8, "technical"),
        ("Visual design", 0.8, "technical"),
        ("Communication", 0.7, "soft"),
    ],
    "doctor-mbbs": [
        ("Clinical reasoning", 0.9, "domain"),
        ("Biology", 0.9, "domain"),
        ("Empathy", 0.8, "soft"),
    ],
}


def salary_bands(slug: str) -> list[SalaryBand]:
    e, m, s = _SALARY[slug]
    out = []
    for code, mult in (("IN-KA-BLR", 1.0), ("IN-TN-CHN", 0.9), ("IN-TN-CBE", 0.75)):
        out.append(
            SalaryBand(
                region_code=code,
                entry_p50=int(e * mult),
                mid_p50=int(m * mult),
                senior_p50=int(s * mult),
                p25_entry=int(e * mult * 0.75),
                p75_entry=int(e * mult * 1.35),
                growth_rate=0.08,
                region_multiplier=mult,
                provenance=EST,
            )
        )
    return out


def career_detail(slug: str) -> CareerDetail:
    req = requirement_vector(slug)
    summary = career_summary(slug)
    return CareerDetail(
        **summary.model_dump(),
        long_description=summary.short_description
        + " Typical employers range from startups to public institutions.",
        riasec_profile={d: req[d] for d in RIASEC},
        requirement_vector=req,
        aptitude_requirements={d: req[d] for d in DIMENSIONS if d.startswith("apt_")},
        skills=[CareerSkill(skill=a, importance=b, category=c) for a, b, c in _SKILLS[slug]],
        salary_bands=salary_bands(slug),
        related_exam_codes=[e[0] for e in w.EXAMS if slug in e[10]],
        day_in_life=[
            "Stand-up with the team",
            "Deep work on the core problem",
            "Review results with stakeholders",
        ],
    )


_ADJ = {  # slug -> [(other, overlap, difficulty, why)]
    "data-scientist": [
        ("computational-biologist", 0.62, 0.45, "Same statistics + Python core, applied to biology"),
        ("agri-drone-engineer", 0.38, 0.55, "Imagery analytics powers precision farming"),
        ("ux-designer", 0.22, 0.70, "Product analytics bridges data and design"),
    ],
    "doctor-mbbs": [
        ("biomedical-engineer", 0.48, 0.50, "Clinical problems, engineering solutions"),
        ("computational-biologist", 0.40, 0.55, "Disease biology through computation"),
    ],
}


def alternatives(slug: str) -> list[CareerAlternative]:
    rows = _ADJ.get(slug) or [("data-scientist", 0.40, 0.50, "Data skills transfer across sectors")]
    return [
        CareerAlternative(
            career=career_ref(o),
            skill_overlap=ov,
            transition_difficulty=diff,
            interdisciplinary=career_ref(o).sector != career_ref(slug).sector,
            why=why,
            student_fit=w.SCORES[o][0],
        )
        for o, ov, diff, why in rows
    ]


def regions() -> list[Region]:
    return [Region(**r) for r in w.REGIONS]


def market_signal(slug: str, region_code: str, k: float = 1.0) -> MarketSignal:
    _, market, _, _, disruption = w.SCORES[slug]
    demand = round(min(1.0, market * k), 3)
    velocity = round((market - 0.6) * 0.8 * k, 3)
    return MarketSignal(
        career=career_ref(slug),
        region_code=region_code,
        period="2026-Q3",
        demand_index=demand,
        job_velocity=velocity,
        disruption_risk=disruption,
        trend="rising" if velocity > 0.08 else "stable" if velocity > -0.02 else "declining",
        provenance=EST,
    )


def institution(key: str) -> Institution:
    return Institution(id=w.sid("institution", key), **w.INSTITUTIONS[key])


_QUOTA = {"govt-mbbs": "government", "pvt-mbbs": "management"}


def pathway(key: str) -> Pathway:
    k, course, level, inst, yrs, tu, ho, li, mi, exams, careers = next(p for p in w.PATHWAYS if p[0] == key)
    return Pathway(
        id=w.sid("pathway", k),
        course=course,
        degree_level=level,
        institution=institution(inst),
        duration_years=yrs,
        quota=_QUOTA.get(k, "open"),
        fee_academic_year=2026,
        tuition_per_year=tu,
        hostel_per_year=ho,
        living_per_year=li,
        misc_per_year=mi,
        entrance_exam_codes=exams,
        career_ids=[w.sid("career", c) for c in careers],
        seats=None,
        provenance=EST,
    )


def _exam_provenance(code: str, url: str | None) -> Provenance:
    check = w.EXAM_CHECKS.get(code)
    if check:
        return Provenance(
            source_name="National Testing Agency exam calendar (via news reports)",
            source_url=None,
            as_of=date(2026, 9, 16),
            confidence=0.8,
            is_estimate=False,
            verification=VerificationStatus(check["verification"]),
            verified_on=w.CHECKED_ON,
            evidence=check["evidence"],
        )
    return Provenance(
        source_name="PRISM estimate from previous exam cycles",
        source_url=None,
        as_of=w.DATA_AS_OF,
        confidence=0.4,
        is_estimate=True,
        evidence=w.EXAM_NOTES.get(code),
    )


def _sessions(code: str, start, end, reg) -> list[ExamSession]:
    check = w.EXAM_CHECKS.get(code, {})
    first = ExamSession(
        cycle_year=2027,
        session_no=1,
        registration_close=reg,
        registration_status=DateStatus.ESTIMATED,
        exam_start=start,
        exam_end=end,
        exam_date_status=DateStatus(check.get("session1_status", "estimated")),
    )
    if code != "JEE_MAIN":
        return [first]
    # JEE Main has a second session in April; NTA has not announced its 2027 dates yet.
    second = ExamSession(
        cycle_year=2027,
        session_no=2,
        registration_close=date(2027, 2, 25),
        registration_status=DateStatus.ESTIMATED,
        exam_start=date(2027, 4, 1),
        exam_end=date(2027, 4, 9),
        exam_date_status=DateStatus.ESTIMATED,
    )
    return [first, second]


def exam(code: str) -> Exam:
    c, name, body, level, freq, start, end, reg, elig, url, careers = next(e for e in w.EXAMS if e[0] == code)
    sessions = _sessions(c, start, end, reg)
    return Exam(
        code=c,
        name=name,
        conducting_body=body,
        level=level,
        frequency=freq,
        next_window_start=start,
        next_window_end=end,
        registration_deadline=reg,
        dates_are_estimates=any(
            DateStatus.ESTIMATED in (x.exam_date_status, x.registration_status) for x in sessions
        ),
        sessions=sessions,
        eligibility_summary=elig,
        syllabus_url=None,
        official_url=url,
        career_ids=[w.sid("career", x) for x in careers],
        provenance=_exam_provenance(c, url),
    )


_PERCENT = {"inst-merit": 0.25}  # 25 % tuition waiver, capped at amount_per_year
_EXCLUSIVE = {"css-nsp": "central_merit", "inspire-she": "central_merit"}


def _scholarship_provenance(key: str, provider: str, url: str | None) -> Provenance:
    check = w.SCHOLARSHIP_CHECKS.get(key)
    if check:
        return Provenance(
            source_name=provider,
            source_url=url,
            as_of=w.CHECKED_ON,
            confidence=0.8,
            is_estimate=False,
            verification=VerificationStatus(check["verification"]),
            verified_on=w.CHECKED_ON,
            evidence=check["evidence"],
        )
    return Provenance(
        source_name=provider, source_url=url, as_of=w.DATA_AS_OF, confidence=0.5, is_estimate=True
    )


def scholarship(key: str) -> Scholarship:
    k, name, prov, ptype, amt, yrs, covers, rules, summ, prob, stack, deadline, url = next(
        s for s in w.SCHOLARSHIPS if s[0] == key
    )
    return Scholarship(
        id=w.sid("scholarship", k),
        name=name,
        provider=prov,
        provider_type=ptype,
        amount_type=AmountType.PERCENT_TUITION if k in _PERCENT else AmountType.FIXED,
        amount_per_year=amt,
        year_amounts=w.SCHOLARSHIP_YEAR_AMOUNTS.get(k),
        percent_of_tuition=_PERCENT.get(k),
        max_years=yrs,
        covers=covers,
        eligibility_rules=rules,
        eligibility_summary=summ,
        probability=prob,
        stackable=stack,
        exclusive_group=_EXCLUSIVE.get(k),
        deadline=deadline,
        deadline_status=DateStatus.ESTIMATED,
        provenance=_scholarship_provenance(k, prov, url),
    )


_ELIG = {
    "css-nsp": False,
    "inspire-she": None,
    "tn-first-grad": None,
    "inst-merit": True,
    "pvt-ug-merit": True,
}


def scholarship_match(key: str) -> ScholarshipMatch:
    s = scholarship(key)
    rules = s.eligibility_rules["all"]
    verdict = _ELIG[key]
    checks = [
        EligibilityCheck(
            rule=f"{r['field']} {r['op']} {r['value']}",
            passed=None if verdict is None else (verdict or i > 0),
        )
        for i, r in enumerate(rules)
    ]
    ev = int(s.amount_per_year * s.max_years * s.probability) if verdict is not False else 0
    return ScholarshipMatch(scholarship=s, eligible=verdict, checks=checks, expected_value=ev)


def local_opportunity(row: tuple) -> LocalOpportunity:
    k, title, problem, district, pins, tags, careers, skills, partner, starter = row
    return LocalOpportunity(
        id=w.sid("local", k),
        title=title,
        problem_statement=problem,
        region_code="IN-TN-CBE",
        district=district,
        pincodes=pins,
        steam_tags=tags,
        linked_careers=[career_ref(c) for c in careers],
        skills=skills,
        partner_type=partner,
        starter_project=starter,
        provenance=Provenance(
            source_name="PRISM curated (district problem scan)",
            source_url=None,
            as_of=w.DATA_AS_OF,
            confidence=0.6,
            is_estimate=True,
        ),
    )


# ---------------------------------------------------------------- financial solver (mirror)
def _total_cost(per_year: int, years: int) -> int:
    return int(sum(per_year * (1 + EDU_INFLATION) ** t for t in range(years)))


def _emi(principal: int) -> int:
    if principal <= 0:
        return 0
    r = LOAN_RATE / 12
    return int(principal * r * (1 + r) ** LOAN_MONTHS / ((1 + r) ** LOAN_MONTHS - 1))


PRIMARY_PATHWAY = {
    "data-scientist": ("gct-cse-ds", ["pvt-ug-merit"]),
    "biomedical-engineer": ("psg-bme", ["inst-merit", "pvt-ug-merit"]),
    "computational-biologist": ("iiser-bsms", ["inspire-she"]),
    "robotics-engineer": ("psg-robotics", ["inst-merit", "pvt-ug-merit"]),
    "agri-drone-engineer": ("tnau-agri", ["pvt-ug-merit"]),
    "ux-designer": ("pvt-bdes", ["inst-merit", "pvt-ug-merit"]),
    "doctor-mbbs": ("pvt-mbbs", ["pvt-ug-merit"]),
}
ALT_PATHWAY = {"doctor-mbbs": [("govt-mbbs", ["pvt-ug-merit"])]}


def assess(
    pathway_key: str,
    scholarship_keys: list[str],
    *,
    funds: int = w.FAMILY_FUNDS,
    loan_tolerance: float = w.FINANCE["loan_tolerance"],
    slug: str,
) -> FinancialAssessment:
    p = pathway(pathway_key)
    per_year = p.tuition_per_year + p.hostel_per_year + p.living_per_year + p.misc_per_year
    cost = _total_cost(per_year, p.duration_years)
    picks = []
    for k in scholarship_keys:
        s = scholarship(k)
        yrs = min(s.max_years, p.duration_years)
        if s.year_amounts:
            total = sum(s.year_amounts[:yrs])
        else:
            award = s.amount_per_year
            if s.amount_type is AmountType.PERCENT_TUITION and s.percent_of_tuition:
                award = min(award, int(p.tuition_per_year * s.percent_of_tuition))
            elif s.amount_type is AmountType.FULL_TUITION:
                award = min(award, p.tuition_per_year)
            total = award * yrs
        picks.append(
            ScholarshipPick(
                scholarship_id=s.id,
                name=s.name,
                amount_total=total,
                probability=s.probability,
                expected_value=int(total * s.probability),
                deadline=s.deadline.isoformat() if s.deadline else None,
            )
        )
    sch = sum(x.expected_value for x in picks)
    own = funds + sch
    cap = w.LOAN_CAPACITY
    loan_required = min(max(0, cost - own), cap)
    gap = max(0, cost - own - cap)
    affordability = round(min(1.0, (own + loan_tolerance * cap) / cost), 4)
    emi = _emi(loan_required)
    monthly_income = w.FINANCE["annual_income"] / 12
    if own >= 1.1 * cost:
        klass = AffordabilityClass.COMFORTABLE
    elif own >= cost:
        klass = AffordabilityClass.STRETCH
    elif own + cap >= cost:
        klass = AffordabilityClass.LOAN_DEPENDENT
    else:
        klass = AffordabilityClass.INFEASIBLE
    entry = _SALARY[slug][0]
    y10 = int(entry * 1.08**9)
    npv = int(sum((entry * 1.08**t - 300_000 * 1.05**t) / 1.08 ** (t + 1) for t in range(10)))
    roi_ratio = round(npv / cost, 3)
    yearly_surplus = entry * 0.35
    payback = (
        round((cost + emi * LOAN_MONTHS - loan_required) / yearly_surplus, 1) if yearly_surplus else None
    )
    return FinancialAssessment(
        pathway_id=p.id,
        pathway_name=p.course,
        institution_name=p.institution.name,
        institution_tier=p.institution.tier,
        quota=p.quota.value,
        duration_years=p.duration_years,
        total_cost=cost,
        family_funds=funds,
        scholarship_plan=picks,
        scholarship_expected=sch,
        loan_capacity=cap,
        loan_required=loan_required,
        monthly_emi=emi,
        burden_ratio=round((emi + w.FINANCE["existing_debt_emi"]) / monthly_income, 3),
        funding_gap=gap,
        affordability=affordability,
        affordability_class=klass,
        roi=RoiDetail(
            npv_earnings_premium=npv,
            roi_ratio=roi_ratio,
            roi_norm=w.SCORES[slug][2],
            payback_years=payback if payback is not None and payback <= 15 else None,
            starting_salary=entry,
            salary_year10=y10,
        ),
    )


# ---------------------------------------------------------------- recommendations
def _gaps(slug: str) -> list[TraitGap]:
    req = requirement_vector(slug)
    rows = [
        TraitGap(
            dimension=d,
            label=DIMENSION_LABELS[d],
            student=persona.VECTOR[d],
            required=req[d],
            gap=round(req[d] - persona.VECTOR[d], 3),
        )
        for d in DIMENSIONS
    ]
    return sorted([g for g in rows if g.gap > 0.05], key=lambda g: -g.gap)[:4]


def _matching(slug: str) -> list[str]:
    req = requirement_vector(slug)
    strong = [d for d in DIMENSIONS if req[d] >= 0.7 and persona.VECTOR[d] >= 0.7]
    return sorted(strong, key=lambda d: -(req[d] + persona.VECTOR[d]))[:3]


def _hm(a: float, b: float) -> float:
    return 0.0 if a + b == 0 else 2 * a * b / (a + b)


BASE_MODEL_CONFIDENCE = 0.85
# Imputed trait dimensions lower confidence: half of the imputed share.
DQ_PENALTY = round(0.5 * (1 - persona.COMPLETENESS), 4)


def data_trust(slug: str, pathway_key: str, scholarship_keys: list[str]) -> DataTrust:
    """Which inputs behind this recommendation were checked against a source, and how fresh they are."""
    today = clock_today()
    p = pathway(pathway_key)
    rows: list[tuple[str, str, Provenance]] = [
        ("market demand", "market_signals", market_signal(slug, "IN-TN-CBE").provenance),
        ("salary band", "salary_bands", salary_bands(slug)[0].provenance),
        (f"fees: {p.course}", "pathways", p.provenance),
    ]
    rows += [
        (f"scholarship: {scholarship(k).name}", "scholarships", scholarship(k).provenance)
        for k in scholarship_keys
    ]
    rows += [(f"exam dates: {exam(c).name}", "exams", exam(c).provenance) for c in p.entrance_exam_codes]
    checked = [
        r for r in rows if r[2].verification in (VerificationStatus.VERIFIED, VerificationStatus.SECONDARY)
    ]
    share = round(len(checked) / len(rows), 4)
    fresh = worst([freshness_status(prov.as_of, today, DATASETS[ds].cadence_days) for _, ds, prov in rows])
    unchecked = [
        name
        for name, _, prov in rows
        if prov.verification not in (VerificationStatus.VERIFIED, VerificationStatus.SECONDARY)
    ]
    note = f"{len(checked)} of {len(rows)} inputs checked against published sources."
    if unchecked:
        note += " Still estimates: " + "; ".join(unchecked) + "."
    return DataTrust(
        verified_share=share,
        freshness=fresh,
        oldest_as_of=min(prov.as_of for _, _, prov in rows).isoformat(),
        inputs=[
            TrustInput(
                name=name,
                verification=prov.verification,
                is_estimate=prov.is_estimate,
                as_of=prov.as_of.isoformat(),
                source_name=prov.source_name,
            )
            for name, _, prov in rows
        ],
        note=note,
    )


def recommendations(
    weights: dict[str, float] | None = None,
    *,
    funds: int = w.FAMILY_FUNDS,
    loan_tolerance: float = w.FINANCE["loan_tolerance"],
) -> list[Recommendation]:
    wt = weights or w.WEIGHTS
    out = []
    for slug in w.SCORES:
        fit, market, roi_norm, accept, disruption = w.SCORES[slug]
        pkey, schs = PRIMARY_PATHWAY[slug]
        fa = assess(pkey, schs, funds=funds, loan_tolerance=loan_tolerance, slug=slug)
        alts = [
            assess(k, s, funds=funds, loan_tolerance=loan_tolerance, slug=slug)
            for k, s in ALT_PATHWAY.get(slug, [])
        ]
        raw = {
            ScoreComponent.FIT: fit,
            ScoreComponent.MARKET: market,
            ScoreComponent.AFFORDABILITY: fa.affordability,
            ScoreComponent.ROI: roi_norm,
            ScoreComponent.FAMILY_ALIGNMENT: accept,
            ScoreComponent.DISRUPTION: disruption,
        }
        contribs = [
            Contribution(
                component=c,
                raw_value=v,
                weight=wt[c.value],
                contribution=round((-1 if c is ScoreComponent.DISRUPTION else 1) * wt[c.value] * v, 4),
            )
            for c, v in raw.items()
        ]
        final = round(min(1.0, max(0.0, sum(x.contribution for x in contribs))), 4)
        trust = data_trust(slug, pkey, schs)
        conf = round(
            BASE_MODEL_CONFIDENCE
            * (0.7 + 0.3 * trust.verified_share)
            * FRESHNESS_CONFIDENCE[trust.freshness]
            * (1 - DQ_PENALTY),
            4,
        )
        half_ci = 0.04 + 0.08 * (1 - trust.verified_share)
        explanation = [
            f"Strong match on {', '.join(DIMENSION_LABELS[d].lower() for d in _matching(slug)) or 'your overall profile'}.",
            f"{fa.pathway_name} at {fa.institution_name} is {fa.affordability_class.value.replace('_', '-')} "
            f"for your family (total about Rs {fa.total_cost:,}).",
            f"Demand outlook {market:.0%} with automation risk {disruption:.0%}.",
        ]
        out.append(
            Recommendation(
                rank=1,
                career=career_ref(slug),
                final_score=final,
                confidence=conf,
                ci_low=round(max(0, final - half_ci), 4),
                ci_high=round(min(1, final + half_ci), 4),
                contributions=contribs,
                fit=FitDetail(
                    fit=fit,
                    cosine=round(min(1, fit + 0.03), 4),
                    distance_score=round(fit - 0.03, 4),
                    ml_score=None,
                    ml_used=False,
                    alpha=0.5,
                    top_matching_dimensions=_matching(slug),
                    gaps=_gaps(slug),
                ),
                market=MarketDetail(
                    market_score=market,
                    demand_index=market,
                    job_velocity=round((market - 0.6) * 0.8, 3),
                    disruption_risk=disruption,
                    regions_considered=["IN-TN-CBE", "IN-TN-CHN", "IN-KA-BLR"],
                    ci_low=round(market - 0.07, 3),
                    ci_high=round(min(1, market + 0.07), 3),
                    signals_as_of=w.DATA_AS_OF.isoformat(),
                ),
                financial=fa,
                alternative_pathways=alts,
                family=FamilyFitDetail(
                    student_fit=fit, parent_acceptance=accept, bridge_score=round(_hm(fit, accept), 4)
                ),
                data_trust=trust,
                buckets=[],
                explanation=explanation,
            )
        )
    out.sort(key=lambda r: -r.final_score)
    for i, r in enumerate(out, 1):
        r.rank = i
    buckets = build_buckets(out)
    for r in out:
        r.buckets = [b for b, items in buckets.items() if any(it.career_id == r.career.id for it in items)]
    return out


def build_buckets(recs: list[Recommendation]) -> dict[Bucket, list[BucketItem]]:
    def item(r: Recommendation, score: float, reason: str) -> BucketItem:
        return BucketItem(
            career_id=r.career.id, career_name=r.career.name, score=round(score, 4), reason=reason
        )

    by_fit = sorted(recs, key=lambda r: -r.fit.fit)
    feasible = [r for r in recs if r.financial.affordability_class is not AffordabilityClass.INFEASIBLE]
    by_family = sorted(
        feasible, key=lambda r: -(0.5 * r.family.parent_acceptance + 0.5 * r.financial.affordability)
    )
    by_bridge = sorted(recs, key=lambda r: -r.family.bridge_score)
    gems = [r for r in recs if r.career.slug in ("agri-drone-engineer", "computational-biologist")]
    stretch = [r for r in recs if r.financial.affordability_class is AffordabilityClass.INFEASIBLE]
    return {
        Bucket.BEST_OVERALL: [item(r, r.final_score, "Highest blended score") for r in recs[:3]],
        Bucket.BEST_FOR_STUDENT: [
            item(r, r.fit.fit, "Closest match to your interests and aptitudes") for r in by_fit[:3]
        ],
        Bucket.BEST_FOR_FAMILY: [
            item(
                r,
                0.5 * r.family.parent_acceptance + 0.5 * r.financial.affordability,
                "Affordable and close to your family's preferences",
            )
            for r in by_family[:3]
        ],
        Bucket.BRIDGE: [
            item(r, r.family.bridge_score, "Balances what you love with what your family values")
            for r in by_bridge[:2]
        ],
        Bucket.HIDDEN_GEMS: [
            item(r, r.final_score, "Interdisciplinary path with strong local opportunities") for r in gems
        ],
        Bucket.STRETCH_GOALS: [
            item(r, r.fit.fit, "Not affordable today; reachable with scholarships or a government seat")
            for r in stretch
        ],
    }


# ---------------------------------------------------------------- conflict index (mirror)
CONFLICT_DIMS = [
    # dimension, gap, weight, student position, parent position
    (
        "domain_preference",
        0.70,
        0.30,
        "Top choices: Data Science, Computational Biology, Design",
        "Top choices: Medicine, Biomedical Engineering",
    ),
    ("risk_appetite", 0.27, 0.15, "Comfortable with some uncertainty (0.57)", "Prefers low risk (0.30)"),
    ("geography", 0.30, 0.15, "Open to Bengaluru/Hyderabad", "Prefers Coimbatore/Chennai"),
    ("budget", 0.25, 0.15, "Top-career costs up to Rs 31 lakh", "Comfortable up to about Rs 12 lakh"),
    ("time_to_earn", 0.40, 0.10, "Fine with 5-6 years of study", "Expects earning within 4 years"),
    ("prestige_stability", 0.55, 0.15, "Values autonomy and creativity", "Values stability"),
]

_DRIVER_TEXT = {
    "domain_preference": (
        "You and your parents rank different fields first, though both lists share a love of biology and health.",
        "Which part of medicine excites you most, and could a health-technology career deliver the same impact?",
    ),
    "prestige_stability": (
        "Your parents prioritise a stable, well-recognised job; you value autonomy and creative work.",
        "What would 'secure enough' look like in numbers, and which careers meet that bar while staying creative?",
    ),
    "time_to_earn": (
        "Some of your preferred paths take 5-6 years before earning; the family plan assumes about 4.",
        "Would an internship-heavy or earn-while-you-learn route make a longer path acceptable?",
    ),
    "geography": (
        "You are open to moving to another metro; your parents would prefer you study nearby.",
        "Which cities feel safe and affordable to everyone, and what support would make a move comfortable?",
    ),
    "risk_appetite": (
        "You are more comfortable with uncertain, fast-moving fields than your parents are.",
        "Which risks worry you most, and what backup plan would make them acceptable?",
    ),
    "budget": (
        "Some preferred courses cost more than the family's comfortable budget.",
        "Which scholarships or lower-cost institutions could close the gap?",
    ),
}


def conflict(full: bool) -> ConflictReport:
    dims = [
        ConflictDimension(
            dimension=d,
            gap=g,
            weight=wt,
            contribution=round(100 * g * wt, 2),
            student_position=sp,
            parent_position=pp,
        )
        for d, g, wt, sp, pp in CONFLICT_DIMS
    ]
    index = round(sum(x.contribution for x in dims), 2)
    band = (
        ConflictBand.ALIGNED
        if index < 20
        else ConflictBand.MILD
        if index < 40
        else ConflictBand.MODERATE
        if index < 60
        else ConflictBand.HIGH
    )
    top = sorted(dims, key=lambda x: -x.contribution)[:3]
    drivers = [
        ConflictDriver(
            dimension=x.dimension,
            explanation=_DRIVER_TEXT[x.dimension][0],
            conversation_prompt=_DRIVER_TEXT[x.dimension][1],
        )
        for x in top
    ]
    recs = recommendations()
    bridges = sorted(recs, key=lambda r: -r.family.bridge_score)[:3]
    bridge_rows = [
        BridgeCareer(
            career=r.career,
            student_fit=r.family.student_fit,
            parent_acceptance=r.family.parent_acceptance,
            bridge_score=r.family.bridge_score,
            why="Strong on both your interests and your family's priorities",
        )
        for r in bridges
    ]
    if full:
        summary = (
            f"Conflict index {index:.0f}/100 ({band.value}). The biggest differences are "
            f"{', '.join(x.dimension.replace('_', ' ') for x in top)}. Bridge careers such as "
            f"{bridge_rows[0].career.name} score well for both student and family."
        )
    else:
        summary = (
            "You and your family agree on a lot, especially your interest in health and science. "
            "A few conversations, mainly about field choice and stability, will help you plan together."
        )
    return ConflictReport(
        visibility="full" if full else "summary",
        index=index,
        band=band,
        dimensions=dims if full else [],
        top_drivers=drivers,
        bridge_careers=bridge_rows,
        summary=summary,
    )


# ---------------------------------------------------------------- run
def input_hash(payload: dict) -> str:
    return "sha256:" + hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def composite(recs: list[Recommendation], conflict_index: float) -> CompositeScores:
    v = persona.VECTOR
    apt = sum(v[d] for d in DIMENSIONS if d.startswith("apt_")) / 4
    riasec = sorted((v[d] for d in RIASEC), reverse=True)
    clarity = (sum(riasec[:3]) / 3 - sum(riasec[3:]) / 3) / 0.5
    fin = sum(r.financial.affordability for r in recs) / len(recs)
    mkt = sum(r.market.market_score for r in recs[:5]) / 5
    readiness = 0.35 * apt + 0.2 * min(1, clarity) + 0.25 * fin + 0.2 * (1 - conflict_index / 100)
    return CompositeScores(
        overall_readiness=round(100 * readiness, 1),
        aptitude_index=round(100 * apt, 1),
        interest_clarity=round(100 * min(1.0, clarity), 1),
        financial_capacity=round(100 * fin, 1),
        family_alignment=round(100 - conflict_index, 1),
        market_outlook=round(100 * mkt, 1),
    )


def sensitivity(recs: list[Recommendation]) -> SensitivityReport:
    spread = {1: (1, 2), 2: (1, 3), 3: (2, 4), 4: (3, 5), 5: (4, 6), 6: (5, 7), 7: (6, 7)}
    return SensitivityReport(
        perturbation=0.2,
        scenarios=64,
        robustness_score=0.82,
        top1_stability=0.89,
        rank_ranges=[
            RankChange(
                career_id=r.career.id,
                career_name=r.career.name,
                base_rank=r.rank,
                min_rank=spread[r.rank][0],
                max_rank=spread[r.rank][1],
            )
            for r in recs
        ],
        most_sensitive_weight="affordability",
    )


def analysis_run(
    *,
    run_id: str = w.RUN_ID,
    kind: str = "baseline",
    parent_run_id: str | None = None,
    weights: dict[str, float] | None = None,
    funds: int = w.FAMILY_FUNDS,
    loan_tolerance: float = w.FINANCE["loan_tolerance"],
    full_conflict: bool = True,
    created_offset_min: int = 0,
) -> AnalysisRun:
    wt = weights or w.WEIGHTS
    recs = recommendations(wt, funds=funds, loan_tolerance=loan_tolerance)
    c = conflict(full_conflict)
    snapshot = {"student_vector": persona.VECTOR, "finance": w.FINANCE, "weights": wt, "funds": funds}
    return AnalysisRun(
        run_id=run_id,
        student_id=w.STUDENT_ID,
        family_id=w.FAMILY_ID,
        kind=kind,
        parent_run_id=parent_run_id,
        created_at=w.NOW + timedelta(minutes=created_offset_min),
        duration_ms=142.7,
        reproducibility=Reproducibility(
            engine_version=ENGINE_VERSION,
            scoring_config_version="weights-2026.10-v1",
            vector_spec_version=VECTOR_SPEC_VERSION,
            input_hash=input_hash(snapshot),
            data_as_of=w.DATA_AS_OF.isoformat(),
            dataset_version=w.DATASET_VERSION,
            latest_dataset_version=w.DATASET_VERSION,
            is_outdated=False,
            family_finance_version=w.FAMILY_FINANCE_VERSION,
            ml_model_version=None,
        ),
        data_quality=DataQuality(
            completeness=persona.COMPLETENESS,
            imputed_fields=persona.IMPUTED,
            confidence_penalty=DQ_PENALTY,
            warnings=[
                f"{DIMENSION_LABELS[d]}: too few items answered, so it was set to the neutral 0.5."
                for d in persona.IMPUTED
            ]
            + [f"{code}: {flag}" for code, sub in persona.SUBMISSIONS.items() for flag in sub.flags],
        ),
        student_vector=persona.VECTOR,
        composite_scores=composite(recs, c.index),
        weights=wt,
        recommendations=recs,
        buckets=build_buckets(recs),
        conflict=c,
        sensitivity=sensitivity(recs),
        links={
            "self": f"/api/v1/analysis/runs/{run_id}",
            "swot": f"/api/v1/analysis/runs/{run_id}/swot",
            "roadmap": f"/api/v1/analysis/runs/{run_id}/roadmap?career_id={recs[0].career.id}",
            "what_if": f"/api/v1/analysis/runs/{run_id}/what-if",
            "conflict": f"/api/v1/analysis/runs/{run_id}/conflict",
        },
    )


def kendall_tau(a: list[str], b: list[str]) -> float:
    common = [x for x in a if x in b]
    n = len(common)
    if n < 2:
        return 1.0
    pos_b = {x: i for i, x in enumerate(b)}
    concordant = discordant = 0
    for i in range(n):
        for j in range(i + 1, n):
            s = pos_b[common[i]] - pos_b[common[j]]
            concordant += s < 0
            discordant += s > 0
    return round((concordant - discordant) / math.comb(n, 2), 4)


REGION_DEMAND_FACTOR = {"metro": 1.0, "tier2": 0.85, "international": 0.9}


def catalog() -> Catalog:
    """The fixture world as a Catalog, so the quality gates and data-status run on it like on real data."""
    return Catalog(
        market_signals=[
            market_signal(c[0], r["code"], REGION_DEMAND_FACTOR.get(r["type"], 0.8))
            for c in w.CAREERS
            for r in w.REGIONS
        ],
        salary_bands=[(c[0], band) for c in w.CAREERS for band in salary_bands(c[0])],
        pathways=[pathway(p[0]) for p in w.PATHWAYS],
        exams=[exam(e[0]) for e in w.EXAMS],
        scholarships=[scholarship(s[0]) for s in w.SCHOLARSHIPS],
        local_opportunities=[local_opportunity(r) for r in w.LOCAL_OPPORTUNITIES],
    )
