"""Plain inputs to the scoring engine. The engine is pure: it never reads a database or the network.

Catalog data (careers, pathways, scholarships, signals...) arrives as the API's own Pydantic models,
so the same engine runs on fixtures (MOCK_MODE) and on the database (live mode).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.schemas.catalog import (
    CareerDetail,
    Exam,
    LocalOpportunity,
    MarketSignal,
    Pathway,
    Region,
    SalaryBand,
    Scholarship,
)


@dataclass(frozen=True)
class Preference:
    rank: int
    career_id: str | None = None
    domain: str | None = None


@dataclass(frozen=True)
class StudentInput:
    student_id: str
    vector: dict[str, float]
    reliability: dict[str, float]
    imputed: tuple[str, ...]
    completeness: float
    grade: int
    region_code: str | None
    state: str | None
    willing_to_relocate: float
    willing_abroad: float
    preferred_regions: tuple[str, ...] = ()
    recent_score_pct: float | None = None
    quality_flags: tuple[str, ...] = ()


@dataclass(frozen=True)
class FamilyInput:
    family_id: str | None
    annual_income: int
    income_growth: float
    savings: int
    existing_emi: int
    dependents: int
    max_emi: int
    loan_tolerance: float
    risk_appetite: float
    relocation: float
    abroad: float
    time_to_earn_years: int
    prestige_vs_stability: str  # stability | balanced | prestige
    preferences: tuple[Preference, ...] = ()
    preferred_regions: tuple[str, ...] = ()
    finance_version: int | None = None


@dataclass(frozen=True)
class Edge:
    from_id: str
    to_id: str
    skill_overlap: float
    transition_difficulty: float
    why: str


@dataclass
class CatalogInput:
    careers: list[CareerDetail]
    pathways: list[Pathway]
    scholarships: list[Scholarship]
    pathway_scholarships: dict[str, list[str]]  # pathway id -> institution-specific scholarship ids
    signals: list[MarketSignal]
    salaries: dict[str, list[SalaryBand]]  # career id -> bands
    exams: dict[str, Exam]
    edges: list[Edge]
    local_opportunities: list[LocalOpportunity]
    regions: dict[str, Region]
    dataset_version: str
    latest_dataset_version: str
    data_as_of: date
    district_of_pincode: dict[str, str] = field(default_factory=dict)
