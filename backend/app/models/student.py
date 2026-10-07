from sqlalchemy import CheckConstraint, Float, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, JSONType, SoftDeleteMixin, TimestampMixin, unit


class StudentProfile(IdMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "student_profiles"
    __table_args__ = (
        CheckConstraint("grade BETWEEN 8 AND 13", name="ck_student_profiles_grade"),
        CheckConstraint(
            "recent_score_pct IS NULL OR recent_score_pct BETWEEN 0 AND 100", name="ck_student_profiles_score"
        ),
        unit("willing_to_relocate", "student_profiles"),
        unit("willing_abroad", "student_profiles"),
    )

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    grade: Mapped[int] = mapped_column(Integer)
    board: Mapped[str] = mapped_column(String(40))
    stream: Mapped[str | None] = mapped_column(String(20), default=None)
    pincode: Mapped[str] = mapped_column(String(6))
    city: Mapped[str] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(80))
    region_code: Mapped[str | None] = mapped_column(String(20), default=None)
    languages: Mapped[list] = mapped_column(JSONType, default=list)
    interests: Mapped[list] = mapped_column(JSONType, default=list)
    extracurriculars: Mapped[list] = mapped_column(JSONType, default=list)
    recent_score_pct: Mapped[float | None] = mapped_column(Float, default=None)
    preferred_regions: Mapped[list] = mapped_column(JSONType, default=list)
    willing_to_relocate: Mapped[float] = mapped_column(Float, default=0.5)
    willing_abroad: Mapped[float] = mapped_column(Float, default=0.2)


class FamilyFinance(IdMixin, TimestampMixin, Base):
    """Versioned: every edit adds a row; analysis runs point at the exact version they used."""

    __tablename__ = "family_finance"
    __table_args__ = (
        UniqueConstraint("family_id", "version", name="uq_family_finance_version"),
        Index(
            "uq_family_finance_current",
            "family_id",
            unique=True,
            postgresql_where=text("is_current"),
            sqlite_where=text("is_current = 1"),
        ),
        CheckConstraint(
            "annual_income IS NULL OR max_affordable_emi + existing_debt_emi <= annual_income / 12.0",
            name="ck_family_finance_emi_vs_income",
        ),
        CheckConstraint(
            "allocatable_savings >= 0 AND existing_debt_emi >= 0 AND max_affordable_emi >= 0",
            name="ck_family_finance_money",
        ),
        CheckConstraint("dependents BETWEEN 0 AND 12", name="ck_family_finance_dependents"),
        CheckConstraint("time_to_earn_years BETWEEN 2 AND 12", name="ck_family_finance_tte"),
        CheckConstraint(
            "prestige_vs_stability IN ('stability','balanced','prestige')", name="ck_family_finance_ps"
        ),
        *(
            unit(c, "family_finance")
            for c in ("loan_tolerance", "risk_appetite", "relocation_willingness", "abroad_willingness")
        ),
    )

    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    is_current: Mapped[bool] = mapped_column(default=True)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    income_band: Mapped[str] = mapped_column(String(12))
    annual_income: Mapped[int | None] = mapped_column(Integer, default=None)
    income_growth_rate: Mapped[float] = mapped_column(Float, default=0.05)
    allocatable_savings: Mapped[int] = mapped_column(Integer)
    existing_debt_emi: Mapped[int] = mapped_column(Integer, default=0)
    dependents: Mapped[int] = mapped_column(Integer, default=1)
    max_affordable_emi: Mapped[int] = mapped_column(Integer)
    loan_tolerance: Mapped[float] = mapped_column(Float)
    risk_appetite: Mapped[float] = mapped_column(Float)
    relocation_willingness: Mapped[float] = mapped_column(Float)
    abroad_willingness: Mapped[float] = mapped_column(Float)
    time_to_earn_years: Mapped[int] = mapped_column(Integer)
    prestige_vs_stability: Mapped[str] = mapped_column(String(10), default="balanced")
    preferred_regions: Mapped[list] = mapped_column(JSONType, default=list)


class ParentCareerPreference(IdMixin, TimestampMixin, Base):
    __tablename__ = "parent_career_preferences"
    __table_args__ = (
        UniqueConstraint("family_id", "parent_user_id", "rank", name="uq_parent_pref_rank"),
        CheckConstraint("rank BETWEEN 1 AND 10", name="ck_parent_pref_rank"),
        CheckConstraint("(career_id IS NOT NULL) <> (domain IS NOT NULL)", name="ck_parent_pref_one_target"),
    )

    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    parent_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rank: Mapped[int] = mapped_column(Integer)
    career_id: Mapped[str | None] = mapped_column(ForeignKey("careers.id", ondelete="SET NULL"), default=None)
    domain: Mapped[str | None] = mapped_column(String(30), default=None)
    note: Mapped[str | None] = mapped_column(String(280), default=None)
