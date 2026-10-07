"""Standard response envelope used by every /api/v1 endpoint."""

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

from app.core.config import API_VERSION, APP_VERSION
from app.core.request_context import get_request_id

T = TypeVar("T")


class ErrorBody(BaseModel):
    code: str = Field(examples=["VALIDATION_ERROR"])
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class Meta(BaseModel):
    request_id: str
    version: str = Field(default=f"{API_VERSION}/{APP_VERSION}")
    mock: bool = Field(default=False, description="true when the payload is a MOCK_MODE fixture")


class Envelope(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: ErrorBody | None = None
    meta: Meta


def ok(data: Any, *, mock: bool = False) -> dict[str, Any]:
    """Wrap a payload. Returned as a dict so FastAPI validates it against Envelope[T]."""
    return {
        "success": True,
        "data": data,
        "error": None,
        "meta": Meta(request_id=get_request_id(), mock=mock).model_dump(),
    }


def fail(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "success": False,
        "data": None,
        "error": ErrorBody(code=code, message=message, details=details or {}).model_dump(),
        "meta": Meta(request_id=get_request_id()).model_dump(),
    }
