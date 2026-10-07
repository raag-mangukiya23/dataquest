"""Alias routes matching the team's agreed examples. Bare JSON (no envelope) on success;
errors still use the standard envelope so clients have one error shape."""

from fastapi import APIRouter

from app.api.deps import Gateway
from app.schemas.compat import (
    CompatLoginRequest,
    CompatLoginResponse,
    CompatPredictRequest,
    CompatPredictResponse,
    CompatResult,
    CompatUser,
    CompatUserCreate,
)

router = APIRouter(prefix="/api", tags=["compat (team aliases)"])


@router.post("/login", response_model=CompatLoginResponse)
def login(body: CompatLoginRequest, gw=Gateway):
    return gw.compat_login(body)


@router.post("/users", response_model=CompatUser, status_code=201)
def create_user(body: CompatUserCreate, gw=Gateway):
    return gw.compat_create_user(body)


@router.get("/users/{user_id}", response_model=CompatUser)
def get_user(user_id: str, gw=Gateway):
    return gw.compat_get_user(user_id)


@router.post("/predict", response_model=CompatPredictResponse)
def predict(body: CompatPredictRequest, gw=Gateway):
    return gw.compat_predict(body)


@router.get("/results/{result_id}", response_model=CompatResult)
def result(result_id: str, gw=Gateway):
    return gw.compat_result(result_id)
