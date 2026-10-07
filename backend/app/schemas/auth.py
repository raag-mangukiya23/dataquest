from datetime import date, datetime

from pydantic import EmailStr, Field

from app.schemas.common import Contract, Role


class RegisterRequest(Contract):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=120)
    role: Role = Field(description="admin cannot self-register")
    date_of_birth: date | None = Field(
        default=None, description="Required for students (minor consent check)"
    )
    preferred_language: str = Field(default="en", max_length=8)


class LoginRequest(Contract):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(Contract):
    refresh_token: str


class TokenPair(Contract):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Access-token lifetime in seconds")


class UserOut(Contract):
    id: str
    email: EmailStr
    full_name: str
    role: Role
    is_minor: bool
    consent_status: str = Field(description="not_required | pending | granted | revoked")
    family_id: str | None = None
    created_at: datetime


class AuthResult(Contract):
    user: UserOut
    tokens: TokenPair
