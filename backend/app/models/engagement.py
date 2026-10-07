"""Real-life follow-through: deadline reminders, outcome follow-ups and local mentors."""

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, JSONType, TimestampMixin


class Reminder(IdMixin, TimestampMixin, Base):
    """Outbox of deadline reminders. A sender (SMS, WhatsApp, email) delivers them; status records the result."""

    __tablename__ = "reminders"
    __table_args__ = (
        UniqueConstraint("user_id", "ref_id", "due", "channel", name="uq_reminders_once"),
        Index("ix_reminders_pending", "status", "send_on"),
        CheckConstraint("channel IN ('sms','whatsapp','email','calendar')", name="ck_reminders_channel"),
        CheckConstraint("status IN ('pending','sent','failed','cancelled')", name="ck_reminders_status"),
    )

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    ref_id: Mapped[str] = mapped_column(String(60))
    due: Mapped[date] = mapped_column(Date)
    send_on: Mapped[date] = mapped_column(Date)
    channel: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10), default="pending")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    error: Mapped[str | None] = mapped_column(String(200), default=None)


class Outcome(IdMixin, TimestampMixin, Base):
    """What actually happened 6-12 months later. The only honest ground truth for evaluating recommendations."""

    __tablename__ = "outcomes"
    __table_args__ = (
        CheckConstraint(
            "satisfaction IS NULL OR satisfaction BETWEEN 1 AND 5", name="ck_outcomes_satisfaction"
        ),
        CheckConstraint(
            "status IN ('enrolled','waiting','dropped','working','other')", name="ck_outcomes_status"
        ),
    )

    student_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str | None] = mapped_column(
        ForeignKey("analysis_runs.id", ondelete="SET NULL"), default=None
    )
    chosen_career_id: Mapped[str | None] = mapped_column(
        ForeignKey("careers.id", ondelete="SET NULL"), default=None
    )
    chosen_pathway_text: Mapped[str | None] = mapped_column(String(200), default=None)
    status: Mapped[str] = mapped_column(String(10))
    admitted: Mapped[bool | None] = mapped_column(default=None)
    scholarship_received: Mapped[bool | None] = mapped_column(default=None)
    satisfaction: Mapped[int | None] = mapped_column(Integer, default=None)
    followed_recommendation_rank: Mapped[int | None] = mapped_column(Integer, default=None)
    notes: Mapped[str | None] = mapped_column(String(500), default=None)


class Mentor(IdMixin, TimestampMixin, Base):
    """Opt-in local professionals or alumni. Contact details are shared only through the counsellor."""

    __tablename__ = "mentors"

    display_name: Mapped[str] = mapped_column(String(80))
    career_id: Mapped[str] = mapped_column(ForeignKey("careers.id", ondelete="CASCADE"), index=True)
    region_id: Mapped[str] = mapped_column(ForeignKey("regions.id", ondelete="CASCADE"), index=True)
    district: Mapped[str] = mapped_column(String(80))
    organisation: Mapped[str | None] = mapped_column(String(120), default=None)
    languages: Mapped[list] = mapped_column(JSONType, default=list)
    bio: Mapped[str] = mapped_column(String(400))
    consent_on: Mapped[date] = mapped_column(Date)
    verified_by: Mapped[str | None] = mapped_column(String(80), default=None)
    active: Mapped[bool] = mapped_column(default=True)
