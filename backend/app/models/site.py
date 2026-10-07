"""Storage for the public PRISM site (site/): saved roadmaps behind ?r=<id> share links, and aptitude-battery
sittings. Numbers and derived scores only: no names, contact details or free text."""

from datetime import datetime

from sqlalchemy import DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, JSONType


class SiteAssessment(IdMixin, Base):
    __tablename__ = "site_assessments"
    __table_args__ = (Index("ix_site_assessments_created", "created_at"),)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    region: Mapped[str] = mapped_column(String(20))
    interest: Mapped[str] = mapped_column(String(20))
    priority: Mapped[str] = mapped_column(String(20))
    composite: Mapped[float] = mapped_column(Float)
    pci: Mapped[int] = mapped_column(Integer)
    conflict_band: Mapped[str] = mapped_column(String(10))
    capacity: Mapped[float] = mapped_column(Float)
    fin_gap: Mapped[float] = mapped_column(Float)
    top1: Mapped[str] = mapped_column(String(120))
    top2: Mapped[str | None] = mapped_column(String(120), default=None)
    top3: Mapped[str | None] = mapped_column(String(120), default=None)
    dataset_version: Mapped[str] = mapped_column(String(60))
    input_json: Mapped[dict] = mapped_column(JSONType)
    result_json: Mapped[dict] = mapped_column(JSONType)


class SiteBatteryAttempt(IdMixin, Base):
    __tablename__ = "site_battery_attempts"
    __table_args__ = (Index("ix_site_battery_created", "created_at"),)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    region: Mapped[str] = mapped_column(String(20))
    interest: Mapped[str] = mapped_column(String(20))
    priority: Mapped[str] = mapped_column(String(20))
    logic: Mapped[float] = mapped_column(Float)
    creative: Mapped[float] = mapped_column(Float)
    comm: Mapped[float] = mapped_column(Float)
    hands: Mapped[float] = mapped_column(Float)
    sci: Mapped[float] = mapped_column(Float)
    mean_aptitude: Mapped[float] = mapped_column(Float)
    answered: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    profile_json: Mapped[dict] = mapped_column(JSONType)
