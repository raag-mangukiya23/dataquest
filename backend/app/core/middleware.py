"""Request-id, access logging and a simple in-memory per-client rate limiter."""

import logging
import threading
import time
from collections import defaultdict, deque

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.envelope import fail
from app.core.errors import ErrorCode
from app.core.request_context import new_request_id, set_request_id

log = logging.getLogger("prism.access")

REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get(REQUEST_ID_HEADER, "")
        rid = (
            incoming if 8 <= len(incoming) <= 64 and incoming.replace("-", "").isalnum() else new_request_id()
        )
        set_request_id(rid)
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers[REQUEST_ID_HEADER] = rid
        response.headers["X-Response-Time-ms"] = str(elapsed_ms)
        log.info(
            "request",
            extra={
                "extra_fields": {
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "elapsed_ms": elapsed_ms,
                }
            },
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding 60 s window per client IP. Single-process only; swap for Redis when scaling out."""

    def __init__(self, app, per_minute: int) -> None:  # noqa: ANN001 - starlette signature
        super().__init__(app)
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if self.per_minute <= 0 or request.url.path.endswith("/health"):
            return await call_next(request)
        client = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with self._lock:
            q = self._hits[client]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= self.per_minute:
                retry = max(1, int(60 - (now - q[0])))
                body = fail(ErrorCode.RATE_LIMITED, "Too many requests", {"retry_after_s": retry})
                return JSONResponse(body, status_code=429, headers={"Retry-After": str(retry)})
            q.append(now)
        return await call_next(request)
