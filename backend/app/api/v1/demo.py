import time

from fastapi import APIRouter

from app.api.deps import Gateway
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
def personas(gw=Gateway):
    _enabled()
    return ok(demo.personas(None if gw.mock else gw.demo_ids()), mock=gw.mock)


@router.get("/walkthrough", response_model=Envelope[DemoWalkthrough])
def walkthrough(gw=Gateway):
    _enabled()
    return ok(demo.walkthrough(None if gw.mock else gw.demo_context()), mock=gw.mock)


@router.post("/reset", response_model=Envelope[DemoResetResult])
def reset(gw=Gateway):
    """Restore every demo family to its seeded state (live mode); a no-op in MOCK_MODE."""
    _enabled()
    s = get_settings()
    start = time.perf_counter()
    if gw.mock:
        people = demo.personas()
        status, n, runs = "noop_mock_mode", len(people), sum(1 for p in people if p.baseline_run_id)
    else:
        n = gw.demo_reset()
        status, runs = "reset", n
    return ok(
        DemoResetResult(
            status=status,
            personas=n,
            runs_precomputed=runs,
            demo_today=s.demo_today.isoformat() if s.demo_today else None,
            took_ms=round((time.perf_counter() - start) * 1000, 2),
        ),
        mock=gw.mock,
    )
