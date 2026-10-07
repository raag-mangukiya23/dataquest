"""Follow-through features: deadlines and reminders, loan explainer, outcomes, mentors, counsellor dashboard,
fairness report."""

from datetime import date, datetime
from enum import StrEnum

from pydantic import Field

from app.schemas.catalog import DateStatus
from app.schemas.common import INR, CareerRef, Contract, Provenance, Unit


# ---------------------------------------------------------------- deadlines and reminders
class DeadlineKind(StrEnum):
    EXAM_REGISTRATION = "exam_registration"
    EXAM = "exam"
    SCHOLARSHIP = "scholarship"


class DeadlineItem(Contract):
    ref_id: str = Field(description="Stable id, e.g. exam:JEE_MAIN:2027:1:reg")
    kind: DeadlineKind
    title: str
    due: date
    days_left: int
    date_status: DateStatus
    for_careers: list[str] = Field(description="Career names in this run that need it")
    official_url: str | None = None
    source_name: str


class Deadlines(Contract):
    student_id: str
    run_id: str | None
    as_of: date
    items: list[DeadlineItem]
    notice: str


class ReminderChannel(StrEnum):
    SMS = "sms"
    WHATSAPP = "whatsapp"
    EMAIL = "email"
    CALENDAR = "calendar"


class ReminderRequest(Contract):
    channel: ReminderChannel
    phone: str | None = Field(
        default=None,
        pattern=r"^\+[1-9]\d{7,14}$",
        description="E.164, e.g. +919876543210. Required for sms/whatsapp; saved on the caller's account.",
    )
    lead_days: list[int] = Field(default=[14, 3], min_length=1, max_length=4)
    horizon_days: int = Field(default=365, ge=7, le=730)


class ReminderOut(Contract):
    id: str
    title: str
    ref_id: str
    due: date
    send_on: date
    channel: ReminderChannel
    status: str = Field(examples=["pending", "sent", "failed", "cancelled"])


class ReminderPlan(Contract):
    created: int
    already_scheduled: int
    reminders: list[ReminderOut]
    notice: str


# ---------------------------------------------------------------- loan explainer
class LoanOption(Contract):
    tenor_years: int
    monthly_emi: INR
    total_repaid: INR
    total_interest: INR


class LoanSchemeCheck(Contract):
    key: str
    name: str
    applies: bool | None = Field(description="null = need more information (e.g. family income)")
    why: str
    benefit: str
    how_to_apply: str
    provenance: Provenance


class LoanExplanation(Contract):
    amount: INR
    course_years: int
    assumed_rate: float = Field(description="Annual interest rate assumed (estimate; banks differ)")
    moratorium_months: int = Field(
        description="Course length + 12 months, when banks usually do not ask for EMIs"
    )
    interest_while_studying: INR = Field(
        description="Simple interest added during the moratorium, after relief"
    )
    owed_when_repayment_starts: INR
    options: list[LoanOption]
    schemes: list[LoanSchemeCheck]
    plain_language: list[str]
    cautions: list[str]


# ---------------------------------------------------------------- outcomes
class OutcomeStatus(StrEnum):
    ENROLLED = "enrolled"
    WAITING = "waiting"
    DROPPED = "dropped"
    WORKING = "working"
    OTHER = "other"


class OutcomeIn(Contract):
    status: OutcomeStatus
    run_id: str | None = None
    chosen_career_id: str | None = None
    chosen_pathway_text: str | None = Field(default=None, max_length=200)
    admitted: bool | None = None
    scholarship_received: bool | None = None
    satisfaction: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = Field(default=None, max_length=500)


class OutcomeOut(OutcomeIn):
    id: str
    student_id: str
    followed_recommendation_rank: int | None = Field(
        description="Rank of the chosen career in the run (null = not in the run or not chosen)"
    )
    created_at: datetime


class OutcomeSummary(Contract):
    responses: int
    by_status: dict[str, int]
    followed_top3_share: Unit | None
    followed_top10_share: Unit | None
    mean_satisfaction: float | None
    scholarship_received_share: Unit | None
    suppressed: bool = Field(description="true = fewer than 5 responses; shares withheld")
    notice: str


# ---------------------------------------------------------------- mentors
class MentorIn(Contract):
    display_name: str = Field(min_length=2, max_length=80, description="First name + initial is enough")
    career_id: str
    region_code: str
    district: str = Field(max_length=80)
    organisation: str | None = Field(default=None, max_length=120)
    languages: list[str] = Field(default_factory=list, max_length=6)
    bio: str = Field(min_length=10, max_length=400)
    consent_on: date = Field(description="Date the mentor agreed in writing to be listed")
    verified_by: str = Field(
        min_length=2, max_length=80, description="Counsellor or school that checked them"
    )


class MentorOut(Contract):
    id: str
    display_name: str
    career: CareerRef
    region_code: str
    district: str
    organisation: str | None
    languages: list[str]
    bio: str
    contact: str = Field(description="How to reach them. Never a phone number or email.")


class MentorDirectory(Contract):
    items: list[MentorOut]
    notice: str


# ---------------------------------------------------------------- counsellor dashboard
class FlagSeverity(StrEnum):
    INFO = "info"
    WARN = "warn"
    URGENT = "urgent"


class StudentFlag(Contract):
    code: str = Field(
        examples=[
            "consent_pending",
            "no_assessment",
            "no_run",
            "high_conflict",
            "top_matches_out_of_reach",
            "low_data_quality",
            "deadline_soon",
            "follow_up_due",
            "run_outdated",
        ]
    )
    severity: FlagSeverity
    message: str


class DashboardRow(Contract):
    student_id: str
    display_name: str = Field(description="First name and initial only")
    grade: int | None
    latest_run_id: str | None
    latest_run_at: datetime | None
    top_career: str | None
    conflict_band: str | None
    flags: list[StudentFlag]


class EducatorDashboard(Contract):
    educator_id: str
    as_of: date
    students: list[DashboardRow] = Field(description="Most urgent first")
    flag_counts: dict[str, int]


# ---------------------------------------------------------------- fairness
class FairnessProbe(Contract):
    name: str
    description: str
    passed: bool
    detail: str


class FairnessReport(Contract):
    dataset_version: str
    model_inputs: list[str] = Field(
        description="Every field the scoring engine reads about a student or family"
    )
    protected_attributes_used: list[str] = Field(description="Must be empty")
    probes: list[FairnessProbe]
    passed: bool
    generated_at: datetime
