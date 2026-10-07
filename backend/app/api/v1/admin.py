from fastapi import APIRouter, Depends

from app.api.deps import Gateway, require_roles
from app.core.envelope import Envelope, ok
from app.schemas.admin import AdminAnalytics, DataRefreshRequest, RefreshResult
from app.schemas.common import Role

router = APIRouter(prefix="/admin", tags=["admin"])
_admin = require_roles(Role.ADMIN)


@router.get("/analytics", response_model=Envelope[AdminAnalytics])
def analytics(p=Depends(_admin), gw=Gateway):
    return ok(gw.admin_analytics(), mock=gw.mock)


@router.post("/data/refresh", response_model=Envelope[RefreshResult], status_code=202)
def refresh(body: DataRefreshRequest, p=Depends(_admin), gw=Gateway):
    return ok(gw.data_refresh(body), mock=gw.mock)
