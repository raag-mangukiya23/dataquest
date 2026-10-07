from datetime import UTC, datetime

from fastapi import APIRouter

from app.core.config import APP_VERSION, ENGINE_VERSION, get_settings
from app.core.envelope import Envelope, ok
from app.ml.predictor import model_available
from app.mocks import world as w
from app.mocks.gateway import build_methodology
from app.schemas.system import ComponentHealth, Health, Methodology

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health", response_model=Envelope[Health])
def health():
    s = get_settings()
    ml = model_available()
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
            },
        )
    )


@router.get("/methodology", response_model=Envelope[Methodology])
def methodology():
    return ok(
        build_methodology(sources_rows={"careers": len(w.CAREERS), "scholarships": len(w.SCHOLARSHIPS)})
    )
