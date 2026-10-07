from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, Gateway, Pagination
from app.core.envelope import Envelope, ok
from app.schemas.catalog import (
    CareerAlternative,
    CareerDetail,
    CareerSummary,
    Exam,
    LocalOpportunity,
    MarketTrends,
    Pathway,
    Region,
    ScholarshipMatch,
)
from app.schemas.common import Page

router = APIRouter(tags=["catalog"])


@router.get("/careers", response_model=Envelope[Page[CareerSummary]])
def list_careers(
    sector: str | None = None,
    steam_tag: str | None = Query(None, pattern="^[STEAMstem a]$"),
    q: str | None = Query(None, max_length=80),
    pg: Pagination = Depends(),
    gw=Gateway,
):
    return ok(gw.list_careers(sector, steam_tag, q, pg.page, pg.page_size), mock=gw.mock)


@router.get("/careers/{career_id}", response_model=Envelope[CareerDetail])
def get_career(career_id: str, gw=Gateway):
    """Accepts a career UUID or slug."""
    return ok(gw.get_career(career_id), mock=gw.mock)


@router.get("/careers/{career_id}/alternatives", response_model=Envelope[list[CareerAlternative]])
def alternatives(career_id: str, gw=Gateway):
    return ok(gw.get_alternatives(career_id), mock=gw.mock)


@router.get("/regions", response_model=Envelope[list[Region]])
def regions(gw=Gateway):
    return ok(gw.list_regions(), mock=gw.mock)


@router.get("/market/trends", response_model=Envelope[MarketTrends])
def market_trends(
    region_code: str = Query(..., examples=["IN-TN-CBE"]), sector: str | None = None, gw=Gateway
):
    return ok(gw.market_trends(region_code, sector), mock=gw.mock)


@router.get("/pathways", response_model=Envelope[Page[Pathway]])
def pathways(
    career_id: str | None = None,
    max_annual_cost: int | None = Query(None, ge=0),
    pg: Pagination = Depends(),
    gw=Gateway,
):
    return ok(gw.list_pathways(career_id, max_annual_cost, pg.page, pg.page_size), mock=gw.mock)


@router.get("/exams", response_model=Envelope[list[Exam]])
def exams(career_id: str | None = None, upcoming_only: bool = True, gw=Gateway):
    return ok(gw.list_exams(career_id, upcoming_only), mock=gw.mock)


@router.get("/scholarships", response_model=Envelope[list[ScholarshipMatch]])
def scholarships(eligible_only: bool = False, career_id: str | None = None, p=CurrentUser, gw=Gateway):
    """Evaluates each scholarship's JSON eligibility rules against the caller's family/student profile."""
    return ok(gw.list_scholarships(p, eligible_only, career_id), mock=gw.mock)


@router.get("/local-opportunities", response_model=Envelope[list[LocalOpportunity]])
def local_opportunities(pincode: str = Query(..., pattern=r"^\d{6}$"), gw=Gateway):
    return ok(gw.local_opportunities(pincode), mock=gw.mock)
