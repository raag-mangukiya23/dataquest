from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, Gateway, Pagination
from app.core.envelope import Envelope, ok
from app.schemas.analysis import (
    AnalysisRun,
    AnalysisRunRequest,
    AnalysisRunSummary,
    ConflictReport,
    RunComparison,
    WhatIfRequest,
    WhatIfResult,
)
from app.schemas.common import Page
from app.schemas.reports import Language, Narrative, Roadmap, SwotReport
from app.services import narrator

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/runs", response_model=Envelope[AnalysisRun], status_code=201)
def create_run(body: AnalysisRunRequest, p=CurrentUser, gw=Gateway):
    """Runs the full pipeline: vectorise -> fit -> financial solver -> conflict index -> market blend ->
    final score -> sensitivity. The run is immutable and reproducible (see `reproducibility`)."""
    return ok(gw.create_run(p, body), mock=gw.mock)


@router.get("/runs", response_model=Envelope[Page[AnalysisRunSummary]])
def list_runs(student_id: str | None = None, pg: Pagination = Depends(), p=CurrentUser, gw=Gateway):
    return ok(gw.list_runs(p, student_id, pg.page, pg.page_size), mock=gw.mock)


@router.get("/runs/{run_id}", response_model=Envelope[AnalysisRun])
def get_run(run_id: str, p=CurrentUser, gw=Gateway):
    return ok(gw.get_run(p, run_id), mock=gw.mock)


@router.get("/compare", response_model=Envelope[RunComparison])
def compare(run_a: str = Query(...), run_b: str = Query(...), p=CurrentUser, gw=Gateway):
    return ok(gw.compare(p, run_a, run_b), mock=gw.mock)


@router.post("/runs/{run_id}/what-if", response_model=Envelope[WhatIfResult], status_code=201)
def what_if(run_id: str, body: WhatIfRequest, p=CurrentUser, gw=Gateway):
    return ok(gw.what_if(p, run_id, body), mock=gw.mock)


@router.get("/runs/{run_id}/conflict", response_model=Envelope[ConflictReport])
def conflict(run_id: str, p=CurrentUser, gw=Gateway):
    """Parents/educators get the full breakdown; students get a gentle summary (visibility=summary)."""
    return ok(gw.get_conflict(p, run_id), mock=gw.mock)


@router.get("/runs/{run_id}/swot", response_model=Envelope[SwotReport])
def swot(run_id: str, career_id: str | None = None, p=CurrentUser, gw=Gateway):
    return ok(gw.get_swot(p, run_id, career_id), mock=gw.mock)


@router.get("/runs/{run_id}/roadmap", response_model=Envelope[Roadmap])
def roadmap(run_id: str, career_id: str | None = None, p=CurrentUser, gw=Gateway):
    return ok(gw.get_roadmap(p, run_id, career_id), mock=gw.mock)


@router.get("/runs/{run_id}/narrative", response_model=Envelope[Narrative])
def narrative(run_id: str, lang: Language = Language.EN, p=CurrentUser, gw=Gateway):
    """Plain-language summary in English, Tamil or Hindi. A language model (GROK_API_KEY) may rephrase it;
    it only sees the anonymised `facts` shown in the response and cannot add numbers. Without a key, or if
    the call fails, fixed templates are used (`source=template`)."""
    return ok(narrator.narrate(gw.get_run(p, run_id), p.role, lang), mock=gw.mock)
