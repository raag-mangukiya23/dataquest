from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, Gateway, require_roles
from app.core.envelope import Envelope, ok
from app.schemas.common import Role
from app.schemas.family import (
    ConsentIn,
    ConsentOut,
    FamilyFinanceIn,
    FamilyFinanceOut,
    FamilyFinanceSummary,
    FamilyOut,
    InviteOut,
    JoinFamilyRequest,
    ParentPreferencesIn,
    ParentPreferencesOut,
)

router = APIRouter(tags=["family"])
_parent = require_roles(Role.PARENT, Role.ADMIN)


@router.post("/families", response_model=Envelope[FamilyOut], status_code=201)
def create_family(p=CurrentUser, gw=Gateway):
    return ok(gw.create_family(p), mock=gw.mock)


@router.get("/families/me", response_model=Envelope[FamilyOut])
def my_family(p=CurrentUser, gw=Gateway):
    return ok(gw.get_my_family(p), mock=gw.mock)


@router.post("/families/invites", response_model=Envelope[InviteOut], status_code=201)
def create_invite(p=CurrentUser, gw=Gateway):
    return ok(gw.create_invite(p), mock=gw.mock)


@router.post("/families/join", response_model=Envelope[FamilyOut])
def join_family(body: JoinFamilyRequest, p=CurrentUser, gw=Gateway):
    return ok(gw.join_family(p, body), mock=gw.mock)


@router.get("/families/{family_id}/finance", response_model=Envelope[FamilyFinanceOut | FamilyFinanceSummary])
def get_finance(family_id: str, p=CurrentUser, gw=Gateway):
    """Parents get raw figures (FamilyFinanceOut); students get a non-numeric FamilyFinanceSummary."""
    return ok(gw.get_finance(p, family_id), mock=gw.mock)


@router.put("/families/{family_id}/finance", response_model=Envelope[FamilyFinanceOut])
def put_finance(family_id: str, body: FamilyFinanceIn, p=Depends(_parent), gw=Gateway):
    return ok(gw.put_finance(p, family_id, body), mock=gw.mock)


@router.get("/families/{family_id}/preferences", response_model=Envelope[ParentPreferencesOut])
def get_preferences(family_id: str, p=Depends(_parent), gw=Gateway):
    return ok(gw.get_preferences(p, family_id), mock=gw.mock)


@router.put("/families/{family_id}/preferences", response_model=Envelope[ParentPreferencesOut])
def put_preferences(family_id: str, body: ParentPreferencesIn, p=Depends(_parent), gw=Gateway):
    return ok(gw.put_preferences(p, family_id, body), mock=gw.mock)


@router.post("/consents", response_model=Envelope[ConsentOut], status_code=201)
def create_consent(body: ConsentIn, p=CurrentUser, gw=Gateway):
    return ok(gw.create_consent(p, body), mock=gw.mock)


@router.get("/consents", response_model=Envelope[list[ConsentOut]])
def list_consents(p=CurrentUser, gw=Gateway):
    return ok(gw.list_consents(p), mock=gw.mock)
