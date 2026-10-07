"""Shared contract primitives."""

from datetime import date
from enum import StrEnum
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")

Unit = Annotated[float, Field(ge=0.0, le=1.0, description="Normalised to [0, 1]")]
Score100 = Annotated[float, Field(ge=0.0, le=100.0, description="Score on a 0-100 scale")]
INR = Annotated[int, Field(ge=0, description="Amount in Indian Rupees (whole rupees)")]


class Contract(BaseModel):
    """Base for all API contracts: reject unknown fields on input, stable field order on output."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Page(Contract, Generic[T]):
    items: list[T]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=200)
    total: int = Field(ge=0)


class Provenance(Contract):
    """Attached to every market, salary, scholarship and cost figure."""

    source_name: str = Field(examples=["PRISM curated estimate"])
    source_url: str | None = Field(default=None, description="Only set when it is a real, checkable URL")
    as_of: date
    confidence: Unit
    is_estimate: bool = Field(description="true = illustrative number that must be verified before use")


class Role(StrEnum):
    STUDENT = "student"
    PARENT = "parent"
    EDUCATOR = "educator"
    ADMIN = "admin"


class RegionType(StrEnum):
    METRO = "metro"
    TIER2 = "tier2"
    TIER3 = "tier3"
    RURAL = "rural"
    INTERNATIONAL = "international"


class AffordabilityClass(StrEnum):
    COMFORTABLE = "comfortable"
    STRETCH = "stretch"
    LOAN_DEPENDENT = "loan_dependent"
    INFEASIBLE = "infeasible"


class ConflictBand(StrEnum):
    ALIGNED = "aligned"
    MILD = "mild"
    MODERATE = "moderate"
    HIGH = "high"


class Bucket(StrEnum):
    BEST_OVERALL = "best_overall"
    BEST_FOR_STUDENT = "best_for_student"
    BEST_FOR_FAMILY = "best_for_family"
    BRIDGE = "bridge"
    HIDDEN_GEMS = "hidden_gems"
    STRETCH_GOALS = "stretch_goals"


class CareerRef(Contract):
    id: str
    slug: str
    name: str
    sector: str
    steam_tags: list[str] = Field(default_factory=list)
