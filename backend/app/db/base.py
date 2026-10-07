"""Declarative base and shared column helpers (portable across PostgreSQL and SQLite)."""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import JSON, CheckConstraint, Date, DateTime, Float, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

JSONType = JSON().with_variant(JSONB(), "postgresql")


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class IdMixin:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, server_default=func.now()
    )


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class ProvenanceMixin:
    """Every market, salary, fee, exam and scholarship row says where it came from and whether it was checked."""

    source_name: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str | None] = mapped_column(String(500), default=None)
    as_of: Mapped[date] = mapped_column(Date)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    is_estimate: Mapped[bool] = mapped_column(default=True)
    verification: Mapped[str] = mapped_column(String(12), default="unverified")
    verified_on: Mapped[date | None] = mapped_column(Date, default=None)
    evidence: Mapped[str | None] = mapped_column(String(600), default=None)
    dataset_version_id: Mapped[str | None] = mapped_column(String(36), default=None, index=True)


def provenance_checks(table: str) -> tuple[CheckConstraint, ...]:
    return (
        CheckConstraint("confidence >= 0 AND confidence <= 1", name=f"ck_{table}_confidence"),
        CheckConstraint(
            "verification IN ('unverified','secondary','verified','disputed')",
            name=f"ck_{table}_verification",
        ),
        CheckConstraint(
            "is_estimate OR (verification IN ('verified','secondary') AND evidence IS NOT NULL "
            "AND verified_on IS NOT NULL)",
            name=f"ck_{table}_fact_checked",
        ),
        CheckConstraint(
            "verification <> 'verified' OR source_url IS NOT NULL", name=f"ck_{table}_verified_url"
        ),
        CheckConstraint("verification <> 'disputed' OR is_estimate", name=f"ck_{table}_disputed_estimate"),
    )


def unit(col: str, table: str) -> CheckConstraint:
    return CheckConstraint(f"{col} >= 0 AND {col} <= 1", name=f"ck_{table}_{col}_unit")
