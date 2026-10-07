from datetime import datetime
from enum import StrEnum

from pydantic import Field, model_validator

from app.schemas.common import INR, Contract, Role, Unit


class IncomeBand(StrEnum):
    BELOW_3L = "below_3l"
    L3_6 = "3l_6l"
    L6_10 = "6l_10l"
    L10_20 = "10l_20l"
    L20_50 = "20l_50l"
    ABOVE_50L = "above_50l"


class PrestigeStability(StrEnum):
    STABILITY = "stability"
    BALANCED = "balanced"
    PRESTIGE = "prestige"


class FamilyMember(Contract):
    user_id: str
    full_name: str
    role: Role
    relation: str = Field(examples=["self", "mother", "father", "guardian"])
    joined_at: datetime


class FamilyOut(Contract):
    id: str
    name: str
    members: list[FamilyMember]
    has_finance: bool
    has_parent_preferences: bool


class InviteOut(Contract):
    invite_code: str = Field(pattern=r"^[A-Z0-9]{8}$")
    family_id: str
    expires_at: datetime
    max_uses: int = 3


class JoinFamilyRequest(Contract):
    invite_code: str = Field(pattern=r"^[A-Z0-9]{8}$")
    relation: str = Field(examples=["mother", "father", "guardian", "self"])


class FamilyFinanceIn(Contract):
    """Parent-side financial vector. Raw values are visible to parents only."""

    income_band: IncomeBand
    annual_income: INR | None = Field(
        default=None, description="Optional exact figure; band midpoint used if absent"
    )
    income_growth_rate: float = Field(default=0.05, ge=-0.2, le=0.3)
    allocatable_savings: INR
    existing_debt_emi: INR = Field(default=0, description="Monthly EMI already being paid")
    dependents: int = Field(default=1, ge=0, le=12)
    max_affordable_emi: INR = Field(description="Max monthly education-loan EMI the family can bear")
    loan_tolerance: Unit
    risk_appetite: Unit
    relocation_willingness: Unit
    abroad_willingness: Unit
    time_to_earn_years: int = Field(
        ge=2, le=12, description="Years until the family expects the child to earn"
    )
    prestige_vs_stability: PrestigeStability = PrestigeStability.BALANCED
    preferred_regions: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _coherent(self) -> "FamilyFinanceIn":
        if self.annual_income is not None and self.annual_income > 0:
            monthly = self.annual_income / 12
            if self.existing_debt_emi + self.max_affordable_emi > monthly:
                raise ValueError("existing_debt_emi + max_affordable_emi exceeds monthly income")
        return self


class FamilyFinanceOut(FamilyFinanceIn):
    family_id: str
    updated_by: str
    updated_at: datetime


class FamilyFinanceSummary(Contract):
    """What a student sees: no raw rupee figures."""

    family_id: str
    budget_comfort: str = Field(examples=["modest", "moderate", "comfortable"])
    open_to_loans: bool
    open_to_relocation: bool
    open_to_abroad: bool


class RankedPreference(Contract):
    rank: int = Field(ge=1, le=10)
    career_id: str | None = None
    domain: str | None = Field(default=None, description="Either a career or a domain")
    note: str | None = Field(default=None, max_length=280)

    @model_validator(mode="after")
    def _one_target(self) -> "RankedPreference":
        if not (self.career_id or self.domain):
            raise ValueError("career_id or domain is required")
        return self


class ParentPreferencesIn(Contract):
    preferences: list[RankedPreference] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def _unique_ranks(self) -> "ParentPreferencesIn":
        ranks = [p.rank for p in self.preferences]
        if len(ranks) != len(set(ranks)):
            raise ValueError("ranks must be unique")
        return self


class ParentPreferencesOut(ParentPreferencesIn):
    family_id: str
    parent_user_id: str
    updated_at: datetime


class ConsentType(StrEnum):
    MINOR_DATA_PROCESSING = "minor_data_processing"
    SHARE_RAW_ANSWERS_WITH_PARENT = "share_raw_answers_with_parent"
    SHARE_RAW_FINANCE_WITH_STUDENT = "share_raw_finance_with_student"
    ANONYMISED_ANALYTICS = "anonymised_analytics"


class ConsentIn(Contract):
    consent_type: ConsentType
    subject_user_id: str = Field(description="Whose data the consent covers")
    granted: bool


class ConsentOut(ConsentIn):
    id: str
    granted_by: str
    granted_at: datetime
    revoked_at: datetime | None = None
