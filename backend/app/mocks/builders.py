"""Turn the fixture world into schema objects. Derived numbers (costs, affordability, final
scores, conflict index, ranks) are computed here so the fixtures are internally consistent.
The production formulas live in app/engine (Phase 4-5); these are deliberately simple mirrors.
"""

from datetime import date, timedelta

from app.core.dimensions import DIMENSIONS, RIASEC
from app.engine.config import DEFAULT_CONFIG, ScoringConfig
from app.engine.eligibility import evaluate
from app.engine.fit import classic_fit
from app.engine.types import CatalogInput, Edge, FamilyInput, Preference, StudentInput
from app.etl.quality import Catalog
from app.ml.prototypes import DOMAIN_PROTOTYPES
from app.mocks import persona
from app.mocks import world as w
from app.schemas.analysis import (
    AnalysisRun,
)
from app.schemas.catalog import (
    AmountType,
    CareerAlternative,
    CareerDetail,
    CareerSkill,
    CareerSummary,
    DateStatus,
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
    CareerRef,
    Provenance,
    VerificationStatus,
)
from app.services.analysis import run_analysis

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
        national_demand_index=w.MARKET_SEED[s][0],
    )


def requirement_vector(slug: str) -> dict[str, float]:
    sector = career_ref(slug).sector
    base = dict(zip(DIMENSIONS, DOMAIN_PROTOTYPES[sector], strict=True))
    return base | w.CAREER_TRAIT_OVERRIDES.get(slug, {})


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
            student_fit=classic_fit(persona.VECTOR, requirement_vector(o))[2],
        )
        for o, ov, diff, why in rows
    ]


def regions() -> list[Region]:
    return [Region(**r) for r in w.REGIONS]


def market_signal(slug: str, region_code: str, k: float = 1.0) -> MarketSignal:
    market, disruption = w.MARKET_SEED[slug]
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
        course_area=w.PATHWAY_META[k][0],
        admission_route=w.PATHWAY_META[k][1],
        selectivity=w.PATHWAY_META[k][2],
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


def scholarship_match(key: str) -> ScholarshipMatch:
    s = scholarship(key)
    st = student_input()
    fam = family_input()
    facts = {
        "annual_income": fam.annual_income,
        "recent_score_pct": st.recent_score_pct,
        "state": st.state,
        "grade": st.grade,
    }
    verdict, checks = evaluate(s.eligibility_rules, facts)
    total = sum(s.year_amounts) if s.year_amounts else s.amount_per_year * s.max_years
    ev = int(total * s.probability) if verdict is not False else 0
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


# ---------------------------------------------------------------- engine inputs from the fixture world
def catalog_input() -> CatalogInput:
    careers = [career_detail(c[0]) for c in w.CAREERS]
    edges = [
        Edge(
            from_id=w.sid("career", a),
            to_id=w.sid("career", o),
            skill_overlap=ov,
            transition_difficulty=diff,
            why=why,
        )
        for a, rows in _ADJ.items()
        for o, ov, diff, why in rows
    ]
    return CatalogInput(
        careers=careers,
        pathways=[pathway(p[0]) for p in w.PATHWAYS],
        scholarships=[scholarship(s[0]) for s in w.SCHOLARSHIPS],
        pathway_scholarships={
            w.sid("pathway", k): [w.sid("scholarship", x) for x in v]
            for k, v in w.PATHWAY_SCHOLARSHIPS.items()
        },
        signals=catalog().market_signals,
        salaries={c.id: c.salary_bands for c in careers},
        exams={e[0]: exam(e[0]) for e in w.EXAMS},
        edges=edges,
        local_opportunities=[local_opportunity(r) for r in w.LOCAL_OPPORTUNITIES],
        regions={r.code: r for r in regions()},
        dataset_version=w.DATASET_VERSION,
        latest_dataset_version=w.DATASET_VERSION,
        data_as_of=w.DATA_AS_OF,
    )


def student_input(profile: dict | None = None) -> StudentInput:
    s = w.STUDENT
    return StudentInput(
        student_id=w.STUDENT_ID,
        vector=dict(persona.VECTOR),
        reliability={d: t.reliability for d, t in persona.TRAITS.items()},
        imputed=tuple(persona.IMPUTED),
        completeness=persona.COMPLETENESS,
        grade=s["grade"],
        region_code=s["region_code"],
        state=s["state"],
        willing_to_relocate=0.7,
        willing_abroad=0.3,
        preferred_regions=("IN-TN-CBE", "IN-KA-BLR", "IN-TG-HYD"),
        recent_score_pct=s["recent_score_pct"],
        quality_flags=tuple(f for sub in persona.SUBMISSIONS.values() for f in sub.flags),
    )


def family_input() -> FamilyInput:
    f = w.FINANCE
    return FamilyInput(
        family_id=w.FAMILY_ID,
        annual_income=f["annual_income"],
        income_growth=f["income_growth_rate"],
        savings=f["allocatable_savings"],
        existing_emi=f["existing_debt_emi"],
        dependents=f["dependents"],
        max_emi=f["max_affordable_emi"],
        loan_tolerance=f["loan_tolerance"],
        risk_appetite=f["risk_appetite"],
        relocation=f["relocation_willingness"],
        abroad=f["abroad_willingness"],
        time_to_earn_years=f["time_to_earn_years"],
        prestige_vs_stability=f["prestige_vs_stability"],
        preferences=tuple(
            Preference(
                rank=p["rank"],
                career_id=w.sid("career", p["career"]) if "career" in p else None,
                domain=p.get("domain"),
            )
            for p in w.PARENT_PREFERENCES
        ),
        preferred_regions=tuple(f["preferred_regions"]),
        finance_version=w.FAMILY_FINANCE_VERSION,
    )


def analysis_run(
    *,
    run_id: str | None = w.RUN_ID,
    kind: str = "baseline",
    parent_run_id: str | None = None,
    full_conflict: bool = True,
    student: StudentInput | None = None,
    family: FamilyInput | None = None,
    cfg: ScoringConfig = DEFAULT_CONFIG,
    created_offset_min: int = 0,
) -> AnalysisRun:
    """The demo persona's run, computed by the real engine on fixture data."""
    return run_analysis(
        student or student_input(),
        family or family_input(),
        catalog_input(),
        today=w.TODAY,
        now=w.NOW + timedelta(minutes=created_offset_min),
        cfg=cfg,
        kind=kind,
        parent_run_id=parent_run_id,
        run_id=run_id,
        full_conflict=full_conflict,
    )


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
