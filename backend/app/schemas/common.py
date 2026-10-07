"""Shared contract primitives."""

from datetime import date
from enum import StrEnum
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

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


class VerificationStatus(StrEnum):
    UNVERIFIED = "unverified"  # nobody has checked it yet
    SECONDARY = "secondary"  # matches reputable secondary reporting; the official source is not yet checked
    VERIFIED = "verified"  # checked against the official / primary source
    DISPUTED = "disputed"  # sources disagree; never shown as fact


class Provenance(Contract):
    """Attached to every market, salary, fee, exam and scholarship figure.

    Rules (enforced here and by DB CHECKs): a figure shown as fact (is_estimate=false) must be verified
    or secondary and carry evidence; 'verified' also needs the official URL; disputed figures are always
    estimates; URLs are https and only ever real.
    """

    source_name: str = Field(examples=["PRISM curated estimate"])
    source_url: str | None = Field(default=None, description="Only set when it is a real, checkable URL")
    as_of: date
    confidence: Unit
    is_estimate: bool = Field(description="true = illustrative or modelled number, not a checked fact")
    verification: VerificationStatus = VerificationStatus.UNVERIFIED
    verified_on: date | None = None
    evidence: str | None = Field(
        default=None,
        max_length=600,
        description="Where exactly the figure was checked (document, section, date)",
    )

    @model_validator(mode="after")
    def _truth_rules(self) -> "Provenance":
        checked = self.verification in (VerificationStatus.VERIFIED, VerificationStatus.SECONDARY)
        if not self.is_estimate and not checked:
            raise ValueError("a figure presented as fact must be verified or secondary-checked")
        if checked and not self.evidence:
            raise ValueError("checked figures must cite evidence")
        if checked and self.verified_on is None:
            raise ValueError("checked figures must record when they were checked")
        if self.verification is VerificationStatus.VERIFIED and not self.source_url:
            raise ValueError("'verified' requires the official source URL")
        if self.verification is VerificationStatus.DISPUTED and not self.is_estimate:
            raise ValueError("disputed figures must stay marked as estimates")
        if self.source_url is not None and not self.source_url.startswith("https://"):
            raise ValueError("source_url must be an https URL")
        return self


class Freshness(StrEnum):
    FRESH = "fresh"  # within the source's normal update cycle
    AGING = "aging"  # one cycle overdue
    STALE = "stale"  # more than one cycle overdue: down-weighted and flagged


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
