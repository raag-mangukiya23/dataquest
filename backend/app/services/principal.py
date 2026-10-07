"""The authenticated caller, as seen by services."""

from dataclasses import dataclass

from app.schemas.common import Role


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: Role
    family_id: str | None = None
    student_id: str | None = None
