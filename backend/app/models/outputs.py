from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, JSONType, TimestampMixin


class ScoringConfigRow(IdMixin, TimestampMixin, Base):
    __tablename__ = "scoring_configs"

    version: Mapped[str] = mapped_column(String(40), unique=True)
    weights: Mapped[dict] = mapped_column(JSONType)
    parameters: Mapped[dict] = mapped_column(JSONType)
    is_active: Mapped[bool] = mapped_column(default=False)


class AnalysisRunRow(IdMixin, TimestampMixin, Base):
    """Immutable. input_snapshot holds every engine input, so any run can be replayed exactly."""

    __tablename__ = "analysis_runs"
    __table_args__ = (
        UniqueConstraint("id", "parent_run_id", name="uq_analysis_runs_id_parent"),
        Index("ix_analysis_runs_student", "student_user_id", "created_at"),
        CheckConstraint("kind IN ('baseline','what_if')", name="ck_analysis_runs_kind"),
    )

    student_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    family_id: Mapped[str | None] = mapped_column(
        ForeignKey("families.id", ondelete="SET NULL"), default=None
    )
    requested_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    family_finance_id: Mapped[str | None] = mapped_column(
        ForeignKey("family_finance.id", ondelete="SET NULL"), default=None
    )
    scoring_config_version: Mapped[str] = mapped_column(String(60))
    dataset_version: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(10), default="baseline")
    parent_run_id: Mapped[str | None] = mapped_column(
        ForeignKey("analysis_runs.id", ondelete="SET NULL"), default=None
    )
    engine_version: Mapped[str] = mapped_column(String(40))
    input_hash: Mapped[str] = mapped_column(String(80), index=True)
    input_snapshot: Mapped[dict] = mapped_column(JSONType)
    output: Mapped[dict] = mapped_column(JSONType)
    conflict_index: Mapped[float] = mapped_column(Float)
    robustness_score: Mapped[float | None] = mapped_column(Float, default=None)
    duration_ms: Mapped[float] = mapped_column(Float)


class RecommendationRow(IdMixin, Base):
    __tablename__ = "recommendations"
    __table_args__ = (UniqueConstraint("run_id", "rank", name="uq_recommendations_rank"),)

    run_id: Mapped[str] = mapped_column(ForeignKey("analysis_runs.id", ondelete="CASCADE"), index=True)
    career_id: Mapped[str] = mapped_column(ForeignKey("careers.id", ondelete="RESTRICT"), index=True)
    pathway_id: Mapped[str] = mapped_column(ForeignKey("pathways.id", ondelete="RESTRICT"))
    rank: Mapped[int] = mapped_column(Integer)
    final_score: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float)
    affordability_class: Mapped[str] = mapped_column(String(16))
    buckets: Mapped[list] = mapped_column(JSONType, default=list)


class RecommendationBreakdown(Base):
    __tablename__ = "recommendation_breakdowns"

    recommendation_id: Mapped[str] = mapped_column(
        ForeignKey("recommendations.id", ondelete="CASCADE"), primary_key=True
    )
    component: Mapped[str] = mapped_column(String(20), primary_key=True)
    raw_value: Mapped[float] = mapped_column(Float)
    weight: Mapped[float] = mapped_column(Float)
    contribution: Mapped[float] = mapped_column(Float)


class ConflictReportRow(IdMixin, Base):
    __tablename__ = "conflict_reports"

    run_id: Mapped[str] = mapped_column(ForeignKey("analysis_runs.id", ondelete="CASCADE"), unique=True)
    index: Mapped[float] = mapped_column(Float)
    band: Mapped[str] = mapped_column(String(10))
    dimensions: Mapped[list] = mapped_column(JSONType)


class WhatIfRun(IdMixin, TimestampMixin, Base):
    __tablename__ = "what_if_runs"

    result_run_id: Mapped[str] = mapped_column(
        ForeignKey("analysis_runs.id", ondelete="CASCADE"), unique=True
    )
    baseline_run_id: Mapped[str] = mapped_column(ForeignKey("analysis_runs.id", ondelete="CASCADE"))
    label: Mapped[str | None] = mapped_column(String(80), default=None)
    overrides: Mapped[dict] = mapped_column(JSONType)


class DataRefreshJob(IdMixin, TimestampMixin, Base):
    __tablename__ = "data_refresh_jobs"

    triggered_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    source: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(12))
    counts: Mapped[dict] = mapped_column(JSONType, default=dict)
    warnings: Mapped[list] = mapped_column(JSONType, default=list)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
