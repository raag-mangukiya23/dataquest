from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.dimensions import DIMENSIONS
from app.db.base import Base, IdMixin, JSONType, TimestampMixin, unit

_DIMS = ",".join(f"'{d}'" for d in DIMENSIONS)


class AssessmentInstrument(IdMixin, TimestampMixin, Base):
    __tablename__ = "assessment_instruments"
    __table_args__ = (UniqueConstraint("code", "version", name="uq_instrument_code_version"),)

    code: Mapped[str] = mapped_column(String(30))
    version: Mapped[str] = mapped_column(String(10))
    name: Mapped[str] = mapped_column(String(80))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class Question(IdMixin, Base):
    __tablename__ = "questions"
    __table_args__ = (
        UniqueConstraint("id", "instrument_id", name="uq_questions_id_instrument"),
        CheckConstraint(f"dimension IN ({_DIMS})", name="ck_questions_dimension"),
        CheckConstraint("type IN ('likert5','mcq')", name="ck_questions_type"),
    )

    instrument_id: Mapped[str] = mapped_column(ForeignKey("assessment_instruments.id", ondelete="RESTRICT"))
    bank_id: Mapped[str] = mapped_column(String(60), unique=True)
    public_id: Mapped[str] = mapped_column(String(20), unique=True)
    dimension: Mapped[str] = mapped_column(String(20))
    type: Mapped[str] = mapped_column(String(8))
    prompt: Mapped[str] = mapped_column(String(400))
    options: Mapped[list | None] = mapped_column(JSONType, default=None)
    correct_key: Mapped[str | None] = mapped_column(String(2), default=None)  # never sent to clients
    difficulty: Mapped[str | None] = mapped_column(String(8), default=None)
    reverse_scored: Mapped[bool] = mapped_column(default=False)
    display_order: Mapped[int] = mapped_column(Integer)


class AssessmentSubmission(IdMixin, TimestampMixin, Base):
    __tablename__ = "assessment_submissions"
    __table_args__ = (
        UniqueConstraint("id", "instrument_id", name="uq_submissions_id_instrument"),
        UniqueConstraint("student_user_id", "client_submission_id", name="uq_submissions_client_id"),
    )

    student_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    instrument_id: Mapped[str] = mapped_column(ForeignKey("assessment_instruments.id", ondelete="RESTRICT"))
    client_submission_id: Mapped[str | None] = mapped_column(String(64), default=None)  # offline retries
    flags: Mapped[list] = mapped_column(JSONType, default=list)
    answered: Mapped[int] = mapped_column(Integer, default=0)


class Response(IdMixin, Base):
    """Composite foreign keys make it impossible to store an answer to another instrument's question."""

    __tablename__ = "responses"
    __table_args__ = (
        UniqueConstraint("submission_id", "question_id", name="uq_responses_once"),
        ForeignKeyConstraint(
            ["submission_id", "instrument_id"],
            ["assessment_submissions.id", "assessment_submissions.instrument_id"],
            ondelete="CASCADE",
            name="fk_responses_submission",
        ),
        ForeignKeyConstraint(
            ["question_id", "instrument_id"],
            ["questions.id", "questions.instrument_id"],
            ondelete="RESTRICT",
            name="fk_responses_question",
        ),
    )

    submission_id: Mapped[str] = mapped_column(String(36))
    question_id: Mapped[str] = mapped_column(String(36))
    instrument_id: Mapped[str] = mapped_column(String(36))
    value: Mapped[str] = mapped_column(String(4))
    response_ms: Mapped[int | None] = mapped_column(Integer, default=None)


class TraitScore(IdMixin, TimestampMixin, Base):
    __tablename__ = "trait_scores"
    __table_args__ = (
        UniqueConstraint("submission_id", "dimension", name="uq_trait_scores_submission_dim"),
        Index("ix_trait_scores_latest", "student_user_id", "dimension", "created_at"),
        unit("normalized", "trait_scores"),
        unit("reliability", "trait_scores"),
    )

    submission_id: Mapped[str] = mapped_column(ForeignKey("assessment_submissions.id", ondelete="CASCADE"))
    student_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    dimension: Mapped[str] = mapped_column(String(20))
    raw: Mapped[float] = mapped_column(Float)
    normalized: Mapped[float] = mapped_column(Float)
    reliability: Mapped[float] = mapped_column(Float)
    answered: Mapped[int] = mapped_column(Integer)
    imputed: Mapped[bool] = mapped_column(default=False)


class TraitNorm(IdMixin, TimestampMixin, Base):
    __tablename__ = "trait_norms"
    __table_args__ = (UniqueConstraint("instrument_id", "dimension", "grade_band", name="uq_trait_norms"),)

    instrument_id: Mapped[str] = mapped_column(ForeignKey("assessment_instruments.id", ondelete="CASCADE"))
    dimension: Mapped[str] = mapped_column(String(20))
    grade_band: Mapped[str] = mapped_column(String(10))
    n: Mapped[int] = mapped_column(Integer)
    quantiles: Mapped[list] = mapped_column(JSONType)
