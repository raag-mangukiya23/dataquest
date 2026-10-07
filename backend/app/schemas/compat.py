"""Alias-route contracts agreed with the team (bare JSON, no envelope)."""

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class _Compat(BaseModel):
    model_config = ConfigDict(extra="ignore")


class CompatLoginRequest(_Compat):
    email: EmailStr
    password: str


class CompatLoginResponse(_Compat):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    role: str


class CompatUserCreate(_Compat):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: str = "student"


class CompatUser(_Compat):
    id: str
    name: str
    email: EmailStr
    role: str


class CompatPredictRequest(_Compat):
    user_id: str | None = None
    student_id: str | None = None
    vector: dict[str, float] | None = Field(default=None, description="Optional canonical student vector")


class CompatPredictResponse(_Compat):
    id: str = Field(description="Result id, usable with GET /api/results/{id}")
    score: float = Field(ge=0, le=100)
    result: str = Field(description="Top recommended career name")
    confidence: float = Field(ge=0, le=1)
    domain_scores: dict[str, float] = Field(default_factory=dict)


class CompatResult(CompatPredictResponse):
    top_careers: list[dict[str, float | str]] = Field(default_factory=list)
