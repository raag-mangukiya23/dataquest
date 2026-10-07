from datetime import datetime
from enum import StrEnum

from pydantic import Field

from app.schemas.common import Contract, Unit


class QuestionType(StrEnum):
    LIKERT5 = "likert5"
    MCQ = "mcq"  # aptitude items with one correct option


class QuestionOption(Contract):
    key: str
    label: str


class Question(Contract):
    id: str
    instrument_code: str
    dimension: str = Field(description="One of the canonical dimensions (see /system/methodology)")
    type: QuestionType
    prompt: str
    options: list[QuestionOption]
    reverse_scored: bool = False
    order: int


class Instrument(Contract):
    code: str = Field(examples=["riasec_v1", "aptitude_v1", "cognitive_v1", "values_v1", "disposition_v1"])
    name: str
    description: str
    version: str
    question_count: int
    est_minutes: int


class Answer(Contract):
    question_id: str
    value: str = Field(description="Likert: '1'..'5'; MCQ: option key")
    response_ms: int | None = Field(
        default=None, ge=0, description="Optional; very fast answers are down-weighted"
    )


class SubmitAnswersRequest(Contract):
    answers: list[Answer] = Field(min_length=1, max_length=300)


class TraitScore(Contract):
    dimension: str
    raw: float
    normalized: Unit
    percentile: float | None = Field(default=None, ge=0, le=100)
    reliability: Unit = Field(description="Item consistency / coverage for this dimension")
    answered: int
    imputed: bool = False


class SubmitResult(Contract):
    instrument_code: str
    submission_id: str
    scored: list[TraitScore]
    flags: list[str] = Field(default_factory=list, examples=[["straight_lining_detected"]])
    submitted_at: datetime


class TraitProfile(Contract):
    student_id: str
    vector_spec_version: str
    vector: dict[str, Unit] = Field(description="Canonical 19-dimension student vector S")
    traits: list[TraitScore]
    completeness: Unit
    instruments_completed: list[str]
    top_riasec_code: str = Field(examples=["IAR"], description="Holland code from top-3 RIASEC dimensions")
