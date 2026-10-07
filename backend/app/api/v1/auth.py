from fastapi import APIRouter

from app.api.deps import CurrentUser, Gateway
from app.core.envelope import Envelope, ok
from app.schemas.auth import AuthResult, LoginRequest, RefreshRequest, RegisterRequest, TokenPair, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Envelope[AuthResult], status_code=201)
def register(body: RegisterRequest, gw=Gateway):
    return ok(gw.register(body), mock=gw.mock)


@router.post("/login", response_model=Envelope[AuthResult])
def login(body: LoginRequest, gw=Gateway):
    return ok(gw.login(body), mock=gw.mock)


@router.post("/refresh", response_model=Envelope[TokenPair])
def refresh(body: RefreshRequest, gw=Gateway):
    return ok(gw.refresh(body), mock=gw.mock)


@router.get("/me", response_model=Envelope[UserOut])
def me(p=CurrentUser, gw=Gateway):
    return ok(gw.me(p), mock=gw.mock)
