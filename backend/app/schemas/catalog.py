"""Careers, market signals, regions, education pathways, exams, scholarships, local opportunities."""

from datetime import date

from pydantic import Field

from app.schemas.common import INR, CareerRef, Contract, Provenance, RegionType, Unit


class SalaryBand(Contract):
    region_code: str
    entry_p50: INR = Field(description="Annual CTC, entry level, median")
    mid_p50: INR
    senior_p50: INR
    p25_entry: INR | None = None
    p75_entry: INR | None = None
    growth_rate: float = Field(ge=-0.2, le=0.5, description="Expected nominal annual salary growth")
    region_multiplier: float = Field(gt=0, le=10)
    provenance: Provenance


class CareerSkill(Contract):
    skill: str
    importance: Unit
    category: str = Field(examples=["technical", "domain", "soft"])


class CareerSummary(CareerRef):
    short_description: str
    typical_entry_education: str
    automation_risk: Unit
    national_demand_index: Unit | None = None


class CareerDetail(CareerSummary):
    long_description: str
    riasec_profile: dict[str, Unit]
    requirement_vector: dict[str, Unit] = Field(description="Career vector C in the canonical space")
    aptitude_requirements: dict[str, Unit]
    skills: list[CareerSkill]
    salary_bands: list[SalaryBand]
    related_exam_codes: list[str]
    day_in_life: list[str] = Field(default_factory=list)


class CareerAlternative(Contract):
    career: CareerRef
    skill_overlap: Unit = Field(description="Jaccard/weighted overlap of career skills")
    transition_difficulty: Unit = Field(description="0 = trivial switch, 1 = full retraining")
    interdisciplinary: bool
    why: str
    student_fit: Unit | None = Field(default=None, description="Present when a run_id is supplied")


class Region(Contract):
    code: str = Field(examples=["IN-TN-CHN"])
    name: str
    state: str | None = None
    country: str
    type: RegionType
    cost_of_living_index: float = Field(gt=0, description="Bengaluru = 1.00")


class MarketSignal(Contract):
    career: CareerRef
    region_code: str
    period: str = Field(examples=["2026-Q3"])
    demand_index: Unit
    job_velocity: float = Field(description="YoY change in postings, e.g. 0.18 = +18 %")
    disruption_risk: Unit
    trend: str = Field(examples=["rising", "stable", "declining"])
    provenance: Provenance


class MarketTrends(Contract):
    region: Region
    period: str
    sector_summary: dict[str, Unit] = Field(description="Mean demand_index per sector")
    top_rising: list[MarketSignal]
    most_disrupted: list[MarketSignal]
    signals: list[MarketSignal]
    is_live: bool = Field(description="false = seeded snapshot, not a live feed")


class Institution(Contract):
    id: str
    name: str
    city: str
    state: str | None
    country: str
    tier: int = Field(ge=1, le=4)
    ranking_source: str | None = Field(default=None, examples=["NIRF 2025 Engineering"])
    rank: int | None = None
    ownership: str = Field(examples=["public", "private", "deemed"])


class Pathway(Contract):
    id: str
    course: str = Field(examples=["B.Tech Computer Science"])
    degree_level: str = Field(examples=["UG", "PG", "Diploma", "Integrated"])
    institution: Institution
    duration_years: int = Field(ge=1, le=7)
    tuition_per_year: INR
    hostel_per_year: INR
    living_per_year: INR
    misc_per_year: INR
    entrance_exam_codes: list[str]
    career_ids: list[str]
    seats: int | None = None
    provenance: Provenance


class Exam(Contract):
    code: str = Field(examples=["JEE_MAIN"])
    name: str
    conducting_body: str
    level: str = Field(examples=["national", "state", "institutional", "international"])
    frequency: str = Field(examples=["twice a year"])
    next_window_start: date | None = None
    next_window_end: date | None = None
    registration_deadline: date | None = None
    dates_are_estimates: bool = True
    eligibility_summary: str
    syllabus_url: str | None = None
    official_url: str | None = None
    career_ids: list[str] = Field(default_factory=list)


class EligibilityCheck(Contract):
    rule: str = Field(examples=["family_income <= 800000"])
    passed: bool | None = Field(description="null = could not evaluate (missing input)")


class Scholarship(Contract):
    id: str
    name: str
    provider: str
    provider_type: str = Field(
        examples=["central_govt", "state_govt", "private", "institution", "international"]
    )
    amount_per_year: INR
    max_years: int = Field(ge=1, le=7)
    covers: list[str] = Field(examples=[["tuition"], ["tuition", "living"]])
    eligibility_rules: dict = Field(description="Machine-evaluable JSON rules")
    eligibility_summary: str
    probability: Unit = Field(description="Heuristic award probability if eligible")
    stackable: bool
    deadline: date | None = None
    provenance: Provenance


class ScholarshipMatch(Contract):
    scholarship: Scholarship
    eligible: bool | None
    checks: list[EligibilityCheck]
    expected_value: INR = Field(description="amount * years * probability")


class LocalOpportunity(Contract):
    id: str
    title: str
    problem_statement: str
    region_code: str
    district: str
    pincodes: list[str]
    steam_tags: list[str]
    linked_careers: list[CareerRef]
    skills: list[str]
    partner_type: str = Field(
        examples=["MSME cluster", "NGO", "district administration", "startup incubator"]
    )
    starter_project: str = Field(description="A concrete project a student could start in 4-8 weeks")
    provenance: Provenance
