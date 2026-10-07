"""Analysis runs, recommendations, financial solver, conflict index, sensitivity, what-if."""

from datetime import datetime
from enum import StrEnum

from pydantic import Field

from app.schemas.common import (
    INR,
    AffordabilityClass,
    Bucket,
    CareerRef,
    ConflictBand,
    Contract,
    Freshness,
    Score100,
    Unit,
    VerificationStatus,
)


class ScoreComponent(StrEnum):
    FIT = "fit"
    MARKET = "market"
    AFFORDABILITY = "affordability"
    ROI = "roi"
    FAMILY_ALIGNMENT = "family_alignment"
    DISRUPTION = "disruption"


class RunOptions(Contract):
    top_k: int = Field(default=10, ge=3, le=40)
    scoring_config_version: str | None = Field(default=None, description="null = active config")
    include_sensitivity: bool = True
    candidate_career_ids: list[str] | None = Field(default=None, description="Restrict the candidate set")


class AnalysisRunRequest(Contract):
    student_id: str
    options: RunOptions = Field(default_factory=RunOptions)


class Reproducibility(Contract):
    engine_version: str
    scoring_config_version: str
    vector_spec_version: str
    input_hash: str = Field(description="sha256 of the canonical input snapshot")
    data_as_of: str = Field(description="Most recent as_of across market/salary/scholarship data used")
    dataset_version: str = Field(description="Catalog snapshot the run read; replays use the same snapshot")
    latest_dataset_version: str = Field(description="Snapshot currently active")
    is_outdated: bool = Field(description="true = newer data exists; offer 'Re-run with latest data'")
    family_finance_version: int | None = Field(description="Exact family_finance version used")
    ml_model_version: str | None


class DataQuality(Contract):
    completeness: Unit
    imputed_fields: list[str]
    confidence_penalty: Unit = Field(description="Subtracted from recommendation confidence")
    warnings: list[str]


class CompositeScores(Contract):
    overall_readiness: Score100
    aptitude_index: Score100
    interest_clarity: Score100 = Field(description="How differentiated the RIASEC profile is")
    financial_capacity: Score100
    family_alignment: Score100 = Field(description="100 - conflict index")
    market_outlook: Score100


class Contribution(Contract):
    component: ScoreComponent
    raw_value: Unit
    weight: float
    contribution: float = Field(description="weight * raw_value (negative for disruption)")


class TraitGap(Contract):
    dimension: str
    label: str
    student: Unit
    required: Unit
    gap: float = Field(description="required - student; > 0 means the student is below requirement")


class FitDetail(Contract):
    fit: Unit
    cosine: Unit
    distance_score: Unit = Field(description="1 - weighted euclidean distance / max distance")
    ml_score: Unit | None
    ml_used: bool
    alpha: Unit
    top_matching_dimensions: list[str]
    gaps: list[TraitGap]


class MarketDetail(Contract):
    market_score: Unit
    demand_index: Unit
    job_velocity: float
    disruption_risk: Unit
    regions_considered: list[str]
    ci_low: Unit
    ci_high: Unit
    signals_as_of: str


class ScholarshipPick(Contract):
    scholarship_id: str
    name: str
    amount_total: INR
    probability: Unit
    expected_value: INR
    deadline: str | None


class RoiDetail(Contract):
    npv_earnings_premium: int = Field(
        description="NPV of 10-yr earnings minus baseline, INR (may be negative)"
    )
    roi_ratio: float = Field(description="npv_earnings_premium / total_cost")
    roi_norm: Unit
    payback_years: float | None = Field(description="null = does not pay back within horizon")
    starting_salary: INR
    salary_year10: INR


class FinancialAssessment(Contract):
    pathway_id: str
    pathway_name: str
    institution_name: str
    institution_tier: int
    quota: str = Field(examples=["government", "management", "open"])
    duration_years: int
    total_cost: INR = Field(description="Inflation-adjusted sum over study years")
    family_funds: INR
    scholarship_plan: list[ScholarshipPick]
    scholarship_expected: INR
    loan_capacity: INR
    loan_required: INR
    monthly_emi: INR
    burden_ratio: float = Field(description="(monthly_emi + existing EMI) / monthly income")
    funding_gap: INR = Field(description="Shortfall after funds + scholarships + full loan capacity")
    affordability: Unit
    affordability_class: AffordabilityClass
    roi: RoiDetail


class TrustInput(Contract):
    name: str = Field(examples=["Exam dates: JEE Main", "Pathway fees", "Salary band"])
    verification: VerificationStatus
    is_estimate: bool
    as_of: str
    source_name: str


class DataTrust(Contract):
    """How much of the data behind one recommendation has actually been checked, and how fresh it is."""

    verified_share: Unit = Field(description="Share of inputs that are verified or secondary-checked")
    freshness: Freshness
    oldest_as_of: str
    inputs: list[TrustInput]
    note: str


class FamilyFitDetail(Contract):
    student_fit: Unit
    parent_acceptance: Unit
    bridge_score: Unit = Field(description="Harmonic mean of student_fit and parent_acceptance")


class Recommendation(Contract):
    rank: int = Field(ge=1)
    career: CareerRef
    final_score: Unit
    confidence: Unit
    ci_low: Unit
    ci_high: Unit
    contributions: list[Contribution]
    fit: FitDetail
    market: MarketDetail
    financial: FinancialAssessment
    alternative_pathways: list[FinancialAssessment] = Field(default_factory=list, max_length=3)
    family: FamilyFitDetail
    data_trust: DataTrust
    buckets: list[Bucket]
    explanation: list[str] = Field(description="Plain-language reasons, most important first")


class BucketItem(Contract):
    career_id: str
    career_name: str
    score: Unit
    reason: str


class ConflictDimension(Contract):
    dimension: str = Field(
        examples=[
            "domain_preference",
            "risk_appetite",
            "geography",
            "budget",
            "time_to_earn",
            "prestige_stability",
        ]
    )
    gap: Unit
    weight: float
    contribution: float = Field(description="Points on the 0-100 index")
    student_position: str
    parent_position: str


class ConflictDriver(Contract):
    dimension: str
    explanation: str
    conversation_prompt: str


class BridgeCareer(Contract):
    career: CareerRef
    student_fit: Unit
    parent_acceptance: Unit
    bridge_score: Unit
    why: str


class ConflictReport(Contract):
    visibility: str = Field(description="full (parent/educator) | summary (student-facing, gentle)")
    index: Score100
    band: ConflictBand
    dimensions: list[ConflictDimension] = Field(default_factory=list, description="Empty in summary view")
    top_drivers: list[ConflictDriver] = Field(max_length=3)
    bridge_careers: list[BridgeCareer]
    summary: str


class RankChange(Contract):
    career_id: str
    career_name: str
    base_rank: int
    min_rank: int
    max_rank: int


class SensitivityReport(Contract):
    perturbation: float = Field(description="Relative weight perturbation, e.g. 0.2 = +/-20 %")
    scenarios: int
    robustness_score: Unit = Field(description="Mean Kendall-tau-based rank stability of the top-k")
    top1_stability: Unit = Field(description="Share of scenarios where the #1 career is unchanged")
    rank_ranges: list[RankChange]
    most_sensitive_weight: str


class AnalysisRun(Contract):
    run_id: str
    student_id: str
    family_id: str | None
    kind: str = Field(examples=["baseline", "what_if"])
    parent_run_id: str | None = None
    created_at: datetime
    duration_ms: float
    reproducibility: Reproducibility
    data_quality: DataQuality
    student_vector: dict[str, Unit]
    composite_scores: CompositeScores
    weights: dict[str, float]
    recommendations: list[Recommendation]
    buckets: dict[Bucket, list[BucketItem]]
    conflict: ConflictReport
    sensitivity: SensitivityReport | None
    links: dict[str, str] = Field(description="Relative URLs for swot/roadmap/what-if")


class AnalysisRunSummary(Contract):
    run_id: str
    student_id: str
    kind: str
    created_at: datetime
    top_career: str
    top_score: Unit
    conflict_index: Score100
    scoring_config_version: str


class WhatIfOverrides(Contract):
    allocatable_savings: INR | None = None
    annual_income: INR | None = None
    max_affordable_emi: INR | None = None
    loan_tolerance: Unit | None = None
    risk_appetite: Unit | None = None
    relocation_willingness: Unit | None = None
    abroad_willingness: Unit | None = None
    preferred_regions: list[str] | None = None
    weights: dict[ScoreComponent, float] | None = Field(default=None, description="Partial weight override")


class WhatIfRequest(Contract):
    overrides: WhatIfOverrides
    label: str | None = Field(default=None, max_length=80, examples=["Take an education loan"])


class CareerDelta(Contract):
    career_id: str
    career_name: str
    base_rank: int | None
    new_rank: int | None
    base_score: Unit | None
    new_score: Unit | None
    score_delta: float
    base_class: AffordabilityClass | None
    new_class: AffordabilityClass | None


class RunComparison(Contract):
    base_run_id: str
    other_run_id: str
    rank_correlation: float = Field(ge=-1, le=1, description="Kendall tau over the union of top-k")
    deltas: list[CareerDelta]
    entered_top_k: list[str]
    left_top_k: list[str]
    conflict_index_delta: float
    summary: list[str]


class WhatIfResult(Contract):
    baseline_run_id: str
    what_if_run_id: str
    label: str | None
    overrides: WhatIfOverrides
    comparison: RunComparison
    new_top: list[BucketItem]
