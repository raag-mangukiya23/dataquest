"""Shared FastAPI dependencies."""

from fastapi import Depends, Header, Query

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.core.security import decode_access_token
from app.mocks import world as w
from app.schemas.common import Role
from app.services.gateway import get_gateway
from app.services.principal import Principal


def get_principal(
    authorization: str | None = Header(default=None, description="Bearer <access_token>"),
    x_mock_role: Role | None = Header(
        default=None, description="MOCK_MODE only: impersonate a role to test role-specific views"
    ),
    gw=Depends(get_gateway),
) -> Principal:
    if get_settings().mock_mode:
        role = x_mock_role or Role.STUDENT
        user_id = w.PARENT_USER_ID if role is Role.PARENT else w.STUDENT_USER_ID
        return Principal(user_id=user_id, role=role, family_id=w.FAMILY_ID, student_id=w.STUDENT_ID)
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError(ErrorCode.UNAUTHORIZED, "Sign in first: send Authorization: Bearer <access_token>")
    claims = decode_access_token(authorization.split(" ", 1)[1].strip())
    return gw.principal(claims["sub"])


def require_roles(*roles: Role):
    def _check(p: Principal = Depends(get_principal)) -> Principal:
        if p.role not in roles:
            raise AppError(ErrorCode.FORBIDDEN, "Insufficient role", {"required": [r.value for r in roles]})
        return p

    return _check


class Pagination:
    def __init__(self, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=200)) -> None:
        self.page = page
        self.page_size = page_size


Gateway = Depends(get_gateway)
CurrentUser = Depends(get_principal)
