from fastapi import APIRouter, Depends

from app.api.deps import Gateway, require_roles
from app.core.envelope import Envelope, ok
from app.schemas.assessment import Instrument, Question, SubmitAnswersRequest, SubmitResult
from app.schemas.common import Role

router = APIRouter(prefix="/assessments", tags=["assessment"])


@router.get("/instruments", response_model=Envelope[list[Instrument]])
def instruments(gw=Gateway):
    return ok(gw.list_instruments(), mock=gw.mock)


@router.get("/{instrument_code}/questions", response_model=Envelope[list[Question]])
def questions(instrument_code: str, gw=Gateway):
    return ok(gw.get_questions(instrument_code), mock=gw.mock)


@router.post("/{instrument_code}/submit", response_model=Envelope[SubmitResult])
def submit(
    instrument_code: str, body: SubmitAnswersRequest, p=Depends(require_roles(Role.STUDENT)), gw=Gateway
):
    return ok(gw.submit(p, instrument_code, body), mock=gw.mock)
