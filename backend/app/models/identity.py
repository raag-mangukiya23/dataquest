from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, JSONType, SoftDeleteMixin, TimestampMixin


class User(IdMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('student','parent','educator','admin')", name="ck_users_role"),
    )

    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)  # stored lower-cased
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(10))
    date_of_birth: Mapped[date | None] = mapped_column(Date, default=None)
    preferred_language: Mapped[str] = mapped_column(String(8), default="en")
    phone: Mapped[str | None] = mapped_column(String(20), default=None)  # for reminders, opt-in only
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class RefreshToken(IdMixin, TimestampMixin, Base):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_family: Mapped[str] = mapped_column(String(36), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class Family(IdMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "families"

    name: Mapped[str] = mapped_column(String(120))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)


class FamilyLink(IdMixin, TimestampMixin, Base):
    __tablename__ = "family_links"
    __table_args__ = (
        UniqueConstraint("family_id", "user_id", name="uq_family_links_member"),
        CheckConstraint("member_role IN ('student','parent','guardian')", name="ck_family_links_role"),
        CheckConstraint("status IN ('active','removed')", name="ck_family_links_status"),
        # one active family per student
        Index(
            "uq_family_links_one_student_family",
            "user_id",
            unique=True,
            postgresql_where=text("member_role = 'student' AND status = 'active'"),
            sqlite_where=text("member_role = 'student' AND status = 'active'"),
        ),
    )

    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    member_role: Mapped[str] = mapped_column(String(10))
    relation: Mapped[str] = mapped_column(String(20), default="self")
    status: Mapped[str] = mapped_column(String(10), default="active")


class FamilyInvite(IdMixin, TimestampMixin, Base):
    __tablename__ = "family_invites"
    __table_args__ = (CheckConstraint("uses <= max_uses AND max_uses > 0", name="ck_family_invites_uses"),)

    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"))
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    max_uses: Mapped[int] = mapped_column(Integer, default=3)
    uses: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ConsentRecord(IdMixin, TimestampMixin, Base):
    """Append-only: the current state is the latest row per (subject, consent type)."""

    __tablename__ = "consent_records"
    __table_args__ = (Index("ix_consent_current", "subject_user_id", "consent_type", "created_at"),)

    subject_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    granted_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    granted_by_link_id: Mapped[str | None] = mapped_column(
        ForeignKey("family_links.id", ondelete="SET NULL"), default=None
    )
    consent_type: Mapped[str] = mapped_column(String(40))
    granted: Mapped[bool] = mapped_column()
    policy_version: Mapped[str] = mapped_column(String(20), default="2026-10")


class EducatorAssignment(IdMixin, TimestampMixin, Base):
    __tablename__ = "educator_assignments"
    __table_args__ = (UniqueConstraint("educator_user_id", "student_user_id", name="uq_educator_student"),)

    educator_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    student_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    school_name: Mapped[str | None] = mapped_column(String(160), default=None)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class AuditLog(IdMixin, Base):
    __tablename__ = "audit_logs"

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    actor_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(36), default=None)
    request_id: Mapped[str | None] = mapped_column(String(64), default=None)
    detail: Mapped[dict] = mapped_column(JSONType, default=dict)
