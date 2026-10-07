from datetime import UTC, datetime

from fastapi import APIRouter

from app.api.deps import Gateway
from app.core.clock import today
from app.core.config import APP_VERSION, ENGINE_VERSION, get_settings
from app.core.envelope import Envelope, ok
from app.etl.quality import audit
from app.ml.predictor import model_available
from app.mocks import builders
from app.mocks.gateway import adzuna_adapter, build_methodology
from app.schemas.system import ComponentHealth, DataStatus, Health, Methodology

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health", response_model=Envelope[Health])
def health():
    s = get_settings()
    ml = model_available()
    feed = adzuna_adapter().enabled
    return ok(
        Health(
            status="ok",
            version=APP_VERSION,
            engine_version=ENGINE_VERSION,
            mock_mode=s.mock_mode,
            time=datetime.now(UTC),
            components={
                "database": ComponentHealth(
                    status="disabled" if s.mock_mode else "ok",
                    detail="MOCK_MODE: fixtures only" if s.mock_mode else None,
                ),
                "ml_model": ComponentHealth(
                    status="ok" if ml else "degraded",
                    detail=None if ml else "No model configured; cosine fallback active",
                ),
                "market_feed": ComponentHealth(
                    status="ok" if feed else "disabled",
                    detail=None if feed else "No live postings feed; market data is the dated snapshot",
                ),
            },
        )
    )


@router.get("/methodology", response_model=Envelope[Methodology])
def methodology():
    return ok(build_methodology(audit(builders.catalog(), today())))


@router.get("/data-status", response_model=Envelope[DataStatus])
def data_status(gw=Gateway):
    """How fresh each dataset is, how much of it has been checked, which live feeds are on, and every
    quality-gate finding. Read this before claiming anything is 'real-time'."""
    return ok(gw.data_status(), mock=gw.mock)
