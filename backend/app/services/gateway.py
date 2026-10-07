"""Backend selection. Routers depend on `get_gateway()` and never know whether they are talking
to fixtures (MOCK_MODE=true) or to the live services (repositories + engine)."""

from functools import lru_cache
from typing import Any

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode


@lru_cache
def _mock() -> Any:
    from app.mocks.gateway import MockGateway

    return MockGateway()


def get_gateway() -> Any:
    if get_settings().mock_mode:
        return _mock()
    raise AppError(
        ErrorCode.LIVE_MODE_UNAVAILABLE,
        "Live mode is not wired yet in this build; set MOCK_MODE=true",
        {"hint": "Live services land in Phases 1-7"},
    )
