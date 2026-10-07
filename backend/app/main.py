"""PRISM Engine API entrypoint: `uvicorn app.main:app --reload`."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.compat import router as compat_router
from app.api.v1.router import api_router
from app.core.config import APP_VERSION, get_settings
from app.core.envelope import fail
from app.core.errors import AppError, ErrorCode
from app.core.log_config import configure_logging
from app.core.middleware import RateLimitMiddleware, RequestContextMiddleware

log = logging.getLogger("prism")

_HTTP_CODES = {
    401: ErrorCode.UNAUTHORIZED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    405: ErrorCode.VALIDATION_ERROR,
    409: ErrorCode.CONFLICT,
    429: ErrorCode.RATE_LIMITED,
}


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(
        title="PRISM Engine API",
        version=APP_VERSION,
        description=(
            "Multi-dimensional STEAM career guidance: psychometric + financial vectorisation, financial "
            "constraint solver, parent-student conflict index, market blending, SWOT and roadmaps.\n\n"
            "All /api/v1 responses use the envelope {success, data, error, meta}. "
            f"MOCK_MODE is currently **{settings.mock_mode}**."
        ),
    )

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(fail(exc.code, exc.message, exc.details), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"loc": list(e.get("loc", [])), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()
        ]
        return JSONResponse(
            fail(ErrorCode.VALIDATION_ERROR, "Request validation failed", {"errors": errors}), status_code=422
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, ErrorCode.INTERNAL_ERROR)
        return JSONResponse(fail(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error")
        return JSONResponse(fail(ErrorCode.INTERNAL_ERROR, "Internal server error"), status_code=500)

    # Middleware order: last added runs first -> request id is set before rate limiting/logging.
    app.add_middleware(
        GZipMiddleware, minimum_size=1024
    )  # a full run shrinks ~5x (39 KB -> 7 KB) on slow mobile data
    app.add_middleware(RateLimitMiddleware, per_minute=settings.rate_limit_per_minute)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(RequestContextMiddleware)

    app.include_router(api_router)
    app.include_router(compat_router)
    return app


app = create_app()
