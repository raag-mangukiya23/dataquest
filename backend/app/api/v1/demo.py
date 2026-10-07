import time

from fastapi import APIRouter

from app.core.config import get_settings
from app.core.envelope import Envelope, ok
from app.core.errors import AppError, ErrorCode
from app.mocks import demo
from app.schemas.demo import DemoPersona, DemoResetResult, DemoWalkthrough

router = APIRouter(prefix="/demo", tags=["demo"])


def _enabled() -> None:
    if not get_settings().demo_mode:
        raise AppError(ErrorCode.NOT_FOUND, "Demo endpoints are disabled")


@router.get("/personas", response_model=Envelope[list[DemoPersona]])
def personas():
    _enabled()
    return ok(demo.personas())


@router.get("/walkthrough", response_model=Envelope[DemoWalkthrough])
def walkthrough():
    _enabled()
    return ok(demo.walkthrough())


@router.post("/reset", response_model=Envelope[DemoResetResult])
def reset():
    """Restore every demo persona to its seeded state. In MOCK_MODE there is no state, so this is a no-op."""
    _enabled()
    s = get_settings()
    start = time.perf_counter()
    if not s.mock_mode:
        raise AppError(ErrorCode.LIVE_MODE_UNAVAILABLE, "Demo reset needs the database (Phase 1)")
    people = demo.personas()
    return ok(
        DemoResetResult(
            status="noop_mock_mode",
            personas=len(people),
            runs_precomputed=sum(1 for p in people if p.baseline_run_id),
            demo_today=s.demo_today.isoformat() if s.demo_today else None,
            took_ms=round((time.perf_counter() - start) * 1000, 2),
        ),
        mock=True,
    )
