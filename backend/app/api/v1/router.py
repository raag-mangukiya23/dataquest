from fastapi import APIRouter

from app.api.v1 import admin, analysis, assessment, auth, catalog, demo, family, profiles, system

api_router = APIRouter(prefix="/api/v1")
for module in (auth, profiles, family, assessment, analysis, catalog, admin, system, demo):
    api_router.include_router(module.router)
