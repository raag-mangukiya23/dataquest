"""SWOT and roadmap outputs."""

from datetime import date
from enum import StrEnum

from pydantic import Field

from app.schemas.common import CareerRef, Contract


class SwotItem(Contract):
    title: str
    detail: str
    evidence: dict[str, float | str] = Field(default_factory=dict)
    weight: float = Field(ge=0, le=1, description="Relative importance used for ordering")


class SwotReport(Contract):
    run_id: str
    career: CareerRef | None = Field(description="null = whole-profile SWOT")
    strengths: list[SwotItem]
    weaknesses: list[SwotItem]
    opportunities: list[SwotItem]
    threats: list[SwotItem]
    headline: str


class MilestoneType(StrEnum):
    ACADEMIC = "academic"
    EXAM = "exam"
    APPLICATION = "application"
    SCHOLARSHIP = "scholarship"
    SKILL = "skill"
    PROJECT = "project"
    FINANCE = "finance"
    CAREER = "career"


class Milestone(Contract):
    title: str
    type: MilestoneType
    due: date | None = None
    date_is_estimate: bool = True
    ref_id: str | None = Field(default=None, description="exam code / scholarship id / pathway id")
    detail: str


class RoadmapPhase(Contract):
    year_index: int = Field(ge=1, le=5)
    label: str = Field(examples=["Year 1 - Grade 12 & entrance prep"])
    start: date
    end: date
    milestones: list[Milestone]


class RankedPathway(Contract):
    rank: int
    pathway_id: str
    name: str
    institution_name: str
    affordability_class: str
    total_cost: int
    entrance_exam_codes: list[str]


class SkillAction(Contract):
    dimension_or_skill: str
    gap: float
    action: str
    resource_type: str = Field(examples=["course", "project", "competition", "practice"])
    weeks: int
    resource_name: str | None = Field(default=None, examples=["NPTEL", "SWAYAM", "DIKSHA"])
    resource_url: str | None = Field(default=None, description="Free government learning platform")


class Roadmap(Contract):
    run_id: str
    career: CareerRef
    horizon_years: int = 5
    phases: list[RoadmapPhase]
    ranked_pathways: list[RankedPathway]
    scholarship_deadlines: list[Milestone]
    skill_actions: list[SkillAction]
    plan_b: list[CareerRef] = Field(description="Adjacent careers if the primary route closes")


class Language(StrEnum):
    EN = "en"
    TA = "ta"  # Tamil
    HI = "hi"  # Hindi


class Narrative(Contract):
    run_id: str
    language: Language
    audience: str = Field(examples=["student", "parent"])
    headline: str
    bullets: list[str]
    source: str = Field(description="model = rephrased by the language model; template = fixed wording")
    model: str | None = None
    facts: dict = Field(
        description="Exactly what was sent to the language model (anonymised). Every number in the text "
        "comes from here."
    )
    translation_reviewed: bool = Field(
        description="false = Tamil/Hindi wording not yet checked by a native speaker"
    )
    notice: str
