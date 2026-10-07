from datetime import date

from sqlalchemy import CheckConstraint, Date, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.dimensions import DOMAINS
from app.db.base import (
    Base,
    IdMixin,
    JSONType,
    ProvenanceMixin,
    SoftDeleteMixin,
    TimestampMixin,
    provenance_checks,
    unit,
)

_DOMAINS = ",".join(f"'{d}'" for d in DOMAINS)


class DatasetVersion(IdMixin, TimestampMixin, Base):
    __tablename__ = "dataset_versions"

    label: Mapped[str] = mapped_column(String(60), unique=True)
    source: Mapped[str] = mapped_column(String(20))
    content_hash: Mapped[str] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(default=False)
    counts: Mapped[dict] = mapped_column(JSONType, default=dict)


class Region(IdMixin, TimestampMixin, Base):
    __tablename__ = "regions"
    __table_args__ = (
        CheckConstraint("type IN ('metro','tier2','tier3','rural','international')", name="ck_regions_type"),
        CheckConstraint("cost_of_living_index > 0", name="ck_regions_col"),
    )

    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(80), default=None)
    country: Mapped[str] = mapped_column(String(60))
    type: Mapped[str] = mapped_column(String(14))
    cost_of_living_index: Mapped[float] = mapped_column(Float)
    salary_multiplier: Mapped[float] = mapped_column(Float, default=1.0)


class PincodeRegion(Base):
    __tablename__ = "pincode_regions"

    pincode: Mapped[str] = mapped_column(String(6), primary_key=True)
    district: Mapped[str] = mapped_column(String(80), index=True)
    region_id: Mapped[str] = mapped_column(ForeignKey("regions.id", ondelete="RESTRICT"))


class Career(IdMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "careers"
    __table_args__ = (
        CheckConstraint(f"sector IN ({_DOMAINS})", name="ck_careers_sector"),
        unit("automation_risk", "careers"),
    )

    slug: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    sector: Mapped[str] = mapped_column(String(30), index=True)
    steam_tags: Mapped[list] = mapped_column(JSONType, default=list)
    short_description: Mapped[str] = mapped_column(String(300))
    typical_entry_education: Mapped[str] = mapped_column(String(160))
    automation_risk: Mapped[float] = mapped_column(Float)
    requirement_vector: Mapped[dict] = mapped_column(JSONType)
    search_keywords: Mapped[str] = mapped_column(String(80))
    related_exam_codes: Mapped[list] = mapped_column(JSONType, default=list)


class CareerSkill(IdMixin, Base):
    __tablename__ = "career_skills"
    __table_args__ = (
        UniqueConstraint("career_id", "skill", name="uq_career_skills"),
        unit("importance", "career_skills"),
    )

    career_id: Mapped[str] = mapped_column(ForeignKey("careers.id", ondelete="CASCADE"), index=True)
    skill: Mapped[str] = mapped_column(String(60))
    category: Mapped[str] = mapped_column(String(12))
    importance: Mapped[float] = mapped_column(Float)


class CareerEdge(IdMixin, Base):
    __tablename__ = "career_edges"
    __table_args__ = (
        UniqueConstraint("from_career_id", "to_career_id", name="uq_career_edges"),
        CheckConstraint("from_career_id <> to_career_id", name="ck_career_edges_not_self"),
        unit("skill_overlap", "career_edges"),
        unit("transition_difficulty", "career_edges"),
    )

    from_career_id: Mapped[str] = mapped_column(ForeignKey("careers.id", ondelete="CASCADE"), index=True)
    to_career_id: Mapped[str] = mapped_column(ForeignKey("careers.id", ondelete="CASCADE"))
    skill_overlap: Mapped[float] = mapped_column(Float)
    transition_difficulty: Mapped[float] = mapped_column(Float)
    why: Mapped[str] = mapped_column(String(200))


class MarketSignal(IdMixin, ProvenanceMixin, Base):
    __tablename__ = "market_signals"
    __table_args__ = (
        UniqueConstraint(
            "career_id", "region_id", "period", "source_name", "dataset_version_id", name="uq_market_signals"
        ),
        Index("ix_market_signals_lookup", "career_id", "region_id", "period"),
        unit("demand_index", "market_signals"),
        unit("disruption_risk", "market_signals"),
        *provenance_checks("market_signals"),
    )

    career_id: Mapped[str] = mapped_column(ForeignKey("careers.id", ondelete="CASCADE"))
    region_id: Mapped[str] = mapped_column(ForeignKey("regions.id", ondelete="CASCADE"))
    period: Mapped[str] = mapped_column(String(8))
    demand_index: Mapped[float] = mapped_column(Float)
    job_velocity: Mapped[float] = mapped_column(Float)
    disruption_risk: Mapped[float] = mapped_column(Float)


class SalaryBand(IdMixin, ProvenanceMixin, Base):
    __tablename__ = "salary_bands"
    __table_args__ = (
        UniqueConstraint("career_id", "region_id", "dataset_version_id", name="uq_salary_bands"),
        CheckConstraint("entry_p50 <= mid_p50 AND mid_p50 <= senior_p50", name="ck_salary_bands_order"),
        *provenance_checks("salary_bands"),
    )

    career_id: Mapped[str] = mapped_column(ForeignKey("careers.id", ondelete="CASCADE"), index=True)
    region_id: Mapped[str] = mapped_column(ForeignKey("regions.id", ondelete="CASCADE"))
    entry_p50: Mapped[int] = mapped_column(Integer)
    mid_p50: Mapped[int] = mapped_column(Integer)
    senior_p50: Mapped[int] = mapped_column(Integer)
    growth_rate: Mapped[float] = mapped_column(Float)


class PostingSnapshot(IdMixin, Base):
    __tablename__ = "posting_snapshots"
    __table_args__ = (
        UniqueConstraint("career_id", "region_code", "fetched_on", name="uq_posting_snapshots"),
    )

    career_id: Mapped[str] = mapped_column(ForeignKey("careers.id", ondelete="CASCADE"))
    region_code: Mapped[str] = mapped_column(String(20))
    fetched_on: Mapped[date] = mapped_column(Date)
    posting_count: Mapped[int] = mapped_column(Integer)
    mean_salary: Mapped[float | None] = mapped_column(Float, default=None)
    query: Mapped[str] = mapped_column(String(120))


class Institution(IdMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "institutions"
    __table_args__ = (CheckConstraint("tier BETWEEN 1 AND 4", name="ck_institutions_tier"),)

    name: Mapped[str] = mapped_column(String(160))
    region_id: Mapped[str | None] = mapped_column(ForeignKey("regions.id", ondelete="SET NULL"), default=None)
    city: Mapped[str] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(80), default=None)
    country: Mapped[str] = mapped_column(String(60), default="India")
    tier: Mapped[int] = mapped_column(Integer)
    ownership: Mapped[str] = mapped_column(String(10))
    ranking_source: Mapped[str | None] = mapped_column(String(60), default=None)
    rank: Mapped[int | None] = mapped_column(Integer, default=None)


class Pathway(IdMixin, ProvenanceMixin, SoftDeleteMixin, Base):
    """One row per course, institution and quota (fees differ by quota)."""

    __tablename__ = "pathways"
    __table_args__ = (
        CheckConstraint("duration_years BETWEEN 1 AND 7", name="ck_pathways_duration"),
        CheckConstraint(
            "tuition_per_year >= 0 AND hostel_per_year >= 0 AND living_per_year >= 0 AND misc_per_year >= 0",
            name="ck_pathways_money",
        ),
        CheckConstraint("quota IN ('government','management','nri','open')", name="ck_pathways_quota"),
        unit("selectivity", "pathways"),
        *provenance_checks("pathways"),
    )

    key: Mapped[str] = mapped_column(String(60), unique=True)
    institution_id: Mapped[str] = mapped_column(ForeignKey("institutions.id", ondelete="RESTRICT"))
    course: Mapped[str] = mapped_column(String(120))
    degree_level: Mapped[str] = mapped_column(String(12))
    duration_years: Mapped[int] = mapped_column(Integer)
    quota: Mapped[str] = mapped_column(String(10), default="open")
    fee_academic_year: Mapped[int] = mapped_column(Integer)
    tuition_per_year: Mapped[int] = mapped_column(Integer)
    hostel_per_year: Mapped[int] = mapped_column(Integer)
    living_per_year: Mapped[int] = mapped_column(Integer)
    misc_per_year: Mapped[int] = mapped_column(Integer)
    course_area: Mapped[str] = mapped_column(String(20))
    admission_route: Mapped[str] = mapped_column(String(30))
    selectivity: Mapped[float] = mapped_column(Float, default=0.5)
    seats: Mapped[int | None] = mapped_column(Integer, default=None)


class PathwayCareer(Base):
    __tablename__ = "pathway_careers"

    pathway_id: Mapped[str] = mapped_column(ForeignKey("pathways.id", ondelete="CASCADE"), primary_key=True)
    career_id: Mapped[str] = mapped_column(
        ForeignKey("careers.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class Exam(IdMixin, ProvenanceMixin, Base):
    __tablename__ = "exams"
    __table_args__ = (*provenance_checks("exams"),)

    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    conducting_body: Mapped[str] = mapped_column(String(120))
    level: Mapped[str] = mapped_column(String(16))
    frequency: Mapped[str] = mapped_column(String(30))
    eligibility_summary: Mapped[str] = mapped_column(String(300))
    official_url: Mapped[str | None] = mapped_column(String(300), default=None)


class ExamSession(IdMixin, Base):
    __tablename__ = "exam_sessions"
    __table_args__ = (
        UniqueConstraint("exam_id", "cycle_year", "session_no", name="uq_exam_sessions"),
        CheckConstraint(
            "registration_close IS NULL OR exam_start IS NULL OR registration_close <= exam_start",
            name="ck_exam_sessions_order",
        ),
        CheckConstraint(
            "exam_start IS NULL OR exam_end IS NULL OR exam_start <= exam_end", name="ck_exam_sessions_dates"
        ),
    )

    exam_id: Mapped[str] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), index=True)
    cycle_year: Mapped[int] = mapped_column(Integer)
    session_no: Mapped[int] = mapped_column(Integer)
    registration_close: Mapped[date | None] = mapped_column(Date, default=None, index=True)
    registration_status: Mapped[str] = mapped_column(String(10), default="estimated")
    exam_start: Mapped[date | None] = mapped_column(Date, default=None)
    exam_end: Mapped[date | None] = mapped_column(Date, default=None)
    exam_date_status: Mapped[str] = mapped_column(String(10), default="estimated")


class PathwayExam(Base):
    __tablename__ = "pathway_exams"

    pathway_id: Mapped[str] = mapped_column(ForeignKey("pathways.id", ondelete="CASCADE"), primary_key=True)
    exam_id: Mapped[str] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), primary_key=True)


class Scholarship(IdMixin, ProvenanceMixin, SoftDeleteMixin, Base):
    __tablename__ = "scholarships"
    __table_args__ = (
        CheckConstraint("amount_per_year > 0", name="ck_scholarships_amount"),
        CheckConstraint(
            "amount_type IN ('fixed','percent_tuition','full_tuition')", name="ck_scholarships_type"
        ),
        unit("probability", "scholarships"),
        *provenance_checks("scholarships"),
    )

    key: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    provider: Mapped[str] = mapped_column(String(160))
    provider_type: Mapped[str] = mapped_column(String(16))
    amount_type: Mapped[str] = mapped_column(String(16), default="fixed")
    amount_per_year: Mapped[int] = mapped_column(Integer)
    year_amounts: Mapped[list | None] = mapped_column(JSONType, default=None)
    percent_of_tuition: Mapped[float | None] = mapped_column(Float, default=None)
    max_years: Mapped[int] = mapped_column(Integer)
    covers: Mapped[list] = mapped_column(JSONType, default=list)
    eligibility_rules: Mapped[dict] = mapped_column(JSONType)
    eligibility_summary: Mapped[str] = mapped_column(String(400))
    self_declared_criteria: Mapped[str | None] = mapped_column(String(300), default=None)
    probability: Mapped[float] = mapped_column(Float)
    stackable: Mapped[bool] = mapped_column(default=True)
    exclusive_group: Mapped[str | None] = mapped_column(String(40), default=None)
    deadline: Mapped[date | None] = mapped_column(Date, default=None, index=True)
    deadline_status: Mapped[str] = mapped_column(String(10), default="estimated")


class PathwayScholarship(Base):
    __tablename__ = "pathway_scholarships"

    pathway_id: Mapped[str] = mapped_column(ForeignKey("pathways.id", ondelete="CASCADE"), primary_key=True)
    scholarship_id: Mapped[str] = mapped_column(
        ForeignKey("scholarships.id", ondelete="CASCADE"), primary_key=True
    )


class LocalOpportunity(IdMixin, ProvenanceMixin, Base):
    __tablename__ = "local_opportunities"
    __table_args__ = (*provenance_checks("local_opportunities"),)

    key: Mapped[str] = mapped_column(String(60), unique=True)
    region_id: Mapped[str] = mapped_column(ForeignKey("regions.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    problem_statement: Mapped[str] = mapped_column(String(600))
    district: Mapped[str] = mapped_column(String(80))
    pincodes: Mapped[list] = mapped_column(JSONType, default=list)
    steam_tags: Mapped[list] = mapped_column(JSONType, default=list)
    skills: Mapped[list] = mapped_column(JSONType, default=list)
    partner_type: Mapped[str] = mapped_column(String(60))
    starter_project: Mapped[str] = mapped_column(String(400))


class LocalOpportunityCareer(Base):
    __tablename__ = "local_opportunity_careers"

    local_opportunity_id: Mapped[str] = mapped_column(
        ForeignKey("local_opportunities.id", ondelete="CASCADE"), primary_key=True
    )
    career_id: Mapped[str] = mapped_column(ForeignKey("careers.id", ondelete="CASCADE"), primary_key=True)
