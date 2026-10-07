"""Follow-through: deadlines and reminders, family report, loan explainer, outcomes, mentors, counsellor
dashboard and the fairness report."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse, Response

from app.api.deps import CurrentUser, Gateway, require_roles
from app.core.clock import today
from app.core.envelope import Envelope, ok
from app.schemas.common import Role
from app.schemas.engagement import (
    Deadlines,
    EducatorDashboard,
    FairnessReport,
    LoanExplanation,
    MentorDirectory,
    MentorIn,
    MentorOut,
    OutcomeIn,
    OutcomeOut,
    OutcomeSummary,
    ReminderOut,
    ReminderPlan,
    ReminderRequest,
)
from app.schemas.reports import Language
from app.services import followthrough as ft
from app.services import narrator

router = APIRouter(tags=["follow-through"])
_fairness_cache: dict[str, FairnessReport] = {}


# ---------------------------------------------------------------- deadlines and reminders
@router.get("/students/{student_id}/deadlines", response_model=Envelope[Deadlines])
def deadlines(student_id: str, horizon_days: int = Query(365, ge=7, le=730), p=CurrentUser, gw=Gateway):
    """Exam registrations, exam dates and scholarship deadlines for the courses in the latest results."""
    return ok(gw.student_deadlines(p, student_id, horizon_days), mock=gw.mock)


@router.get(
    "/students/{student_id}/deadlines.ics",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {}}}},
)
def deadlines_ics(student_id: str, p=CurrentUser, gw=Gateway):
    """The same deadlines as a calendar file (Google Calendar, phone calendar), with a 3-day alarm."""
    d = gw.student_deadlines(p, student_id, 365)
    return Response(
        ft.to_ics(d),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="prism-deadlines.ics"'},
    )


@router.post("/students/{student_id}/reminders", response_model=Envelope[ReminderPlan], status_code=201)
def create_reminders(student_id: str, body: ReminderRequest, p=CurrentUser, gw=Gateway):
    """Schedule SMS / WhatsApp / email reminders for the caller (student or parent) before each deadline.
    Idempotent: calling again only adds reminders for new deadlines."""
    return ok(gw.create_reminders(p, student_id, body), mock=gw.mock)


@router.get("/me/reminders", response_model=Envelope[list[ReminderOut]])
def my_reminders(p=CurrentUser, gw=Gateway):
    return ok(gw.list_reminders(p), mock=gw.mock)


@router.delete("/me/reminders", response_model=Envelope[dict[str, int]])
def cancel_reminders(p=CurrentUser, gw=Gateway):
    """Stop all pending reminders for the caller."""
    return ok({"cancelled": gw.cancel_reminders(p)}, mock=gw.mock)


# ---------------------------------------------------------------- printable family report
@router.get(
    "/analysis/runs/{run_id}/report",
    response_class=HTMLResponse,
    responses={200: {"content": {"text/html": {}}}},
)
def family_report(run_id: str, lang: Language = Language.EN, p=CurrentUser, gw=Gateway):
    """One-page printable report in English, Tamil or Hindi (browser Print -> Save as PDF). Students get the
    student view; the 'talk about together' prompts are shown to parents only."""
    run = gw.get_run(p, run_id)
    d = ft.deadlines(run, gw.catalog_input(), today(), 365)
    return HTMLResponse(ft.report_html(run, p.role, lang, d, narrator.narrate(run, p.role, lang)))


# ---------------------------------------------------------------- loans
@router.get("/loans/explain", response_model=Envelope[LoanExplanation])
def explain_loan(
    amount: int = Query(..., ge=10_000, le=20_000_000, description="Loan amount in rupees"),
    course_years: int = Query(4, ge=1, le=7),
    annual_income: int | None = Query(
        None, ge=0, le=100_000_000, description="Family income; checks schemes"
    ),
    institution_tier: int | None = Query(None, ge=1, le=4, description="1 = top-ranked (QHEI)"),
    rate: float | None = Query(None, gt=0, lt=0.25, description="Annual rate; default is an estimate"),
    gw=Gateway,
):
    """Plain-language EMI table, interest while studying, and which government schemes apply (CSIS,
    PM-Vidyalaxmi). No login needed; nothing is stored."""
    return ok(ft.explain_loan(amount, course_years, annual_income, institution_tier, rate), mock=gw.mock)


# ---------------------------------------------------------------- outcomes
@router.post("/students/{student_id}/outcomes", response_model=Envelope[OutcomeOut], status_code=201)
def add_outcome(student_id: str, body: OutcomeIn, p=CurrentUser, gw=Gateway):
    """Record what actually happened 6-12 months later: the honest test of the recommendations."""
    return ok(gw.add_outcome(p, student_id, body), mock=gw.mock)


@router.get("/students/{student_id}/outcomes", response_model=Envelope[list[OutcomeOut]])
def list_outcomes(student_id: str, p=CurrentUser, gw=Gateway):
    return ok(gw.list_outcomes(p, student_id), mock=gw.mock)


@router.get("/admin/outcomes/summary", response_model=Envelope[OutcomeSummary])
def outcomes_summary(p=Depends(require_roles(Role.ADMIN)), gw=Gateway):
    """Share of students who followed a top-3 / top-10 recommendation, satisfaction; k-anonymised (k = 5)."""
    return ok(gw.outcomes_summary(), mock=gw.mock)


# ---------------------------------------------------------------- mentors
@router.get("/mentors", response_model=Envelope[MentorDirectory])
def mentors(
    career_id: str | None = None,
    region_code: str | None = None,
    pincode: str | None = Query(None, pattern=r"^\d{6}$"),
    p=CurrentUser,
    gw=Gateway,
):
    """Verified, opt-in local mentors. Contact goes through the school counsellor; no phone numbers."""
    return ok(gw.list_mentors(career_id, region_code, pincode), mock=gw.mock)


@router.post("/mentors", response_model=Envelope[MentorOut], status_code=201)
def add_mentor(body: MentorIn, p=Depends(require_roles(Role.EDUCATOR, Role.ADMIN)), gw=Gateway):
    """Counsellors and admins add mentors who agreed in writing (consent date and verifier required)."""
    return ok(gw.add_mentor(p, body), mock=gw.mock)


# ---------------------------------------------------------------- counsellor dashboard
@router.get("/educator/dashboard", response_model=Envelope[EducatorDashboard])
def educator_dashboard(p=Depends(require_roles(Role.EDUCATOR)), gw=Gateway):
    """Assigned students, most urgent first: pending consent, strong family disagreement, top matches out of
    reach, deadlines within 14 days, follow-ups due. Shows affordability classes, never family money."""
    return ok(gw.educator_dashboard(p), mock=gw.mock)


# ---------------------------------------------------------------- fairness
@router.get("/system/fairness", response_model=Envelope[FairnessReport])
def fairness(gw=Gateway):
    """Counterfactual fairness checks run on the current engine and catalogue (cached per dataset version)."""
    from app.mocks import builders as b

    cat = gw.catalog_input()
    if cat.dataset_version not in _fairness_cache:
        _fairness_cache[cat.dataset_version] = ft.fairness_report(
            b.student_input(), b.family_input(), cat, today(), datetime.now(UTC)
        )
    return ok(_fairness_cache[cat.dataset_version], mock=gw.mock)
