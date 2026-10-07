"""Routes used by the public site (site/app.js). They keep the site's original contract (bare JSON with `ok`),
so the site needs no changes beyond rendering the engine's result; the scoring comes from the PRISM engine."""

import json
import time
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.core.clock import today
from app.services import site_bridge as sb
from app.services.gateway import get_gateway

router = APIRouter(prefix="/api", tags=["site"], include_in_schema=True)
_memory = sb.MemoryStore()


def _json(body: dict, status: int = 200, cache: str = "no-store") -> JSONResponse:
    return JSONResponse(
        body, status_code=status, headers={"cache-control": cache, "x-content-type-options": "nosniff"}
    )


def _fail(status: int, reason: str, detail: str | None = None) -> JSONResponse:
    return _json({"ok": False, "error": reason, **({"detail": detail} if detail else {})}, status)


def _store(gw):
    return _memory if gw.mock else sb.DbStore(gw.db)


def _same_origin(request: Request) -> bool:
    origin = request.headers.get("origin")
    if not origin:
        return True  # curl / test clients
    return urlsplit(origin).netloc == request.headers.get("host", "")


async def _body(request: Request):
    raw = await request.body()
    if len(raw) > sb.MAX_BODY:
        return None, _fail(413, "payload too large")
    try:
        return json.loads(raw or b"null"), None
    except ValueError:
        return None, _fail(400, "body must be valid JSON")


@router.get("/health")
def health(gw=Depends(get_gateway)):
    cat = gw.catalog_input()
    return _json(
        {
            "ok": True,
            "now": sb._iso_now(),
            "storage": True,
            "engine": "prism-backend",
            "careers": len(cat.careers),
            "datasetVersion": cat.dataset_version,
        }
    )


@router.get("/market")
def market(region: str = "chennai", gw=Depends(get_gateway)):
    try:
        return _json(sb.market(region, gw.catalog_input()), cache="public, max-age=60")
    except sb.BadInput:
        return _fail(400, "unknown region", ", ".join(sb.REGION_CODE))


@router.post("/score")
async def score(request: Request, gw=Depends(get_gateway)):
    """Score without saving: the site calls this as sliders move, so every view shows the engine's result."""
    body, err = await _body(request)
    if err:
        return err
    try:
        inp = sb.validate_input(body)
    except sb.BadInput as e:
        return _fail(400, "validation failed", str(e))
    t0 = time.perf_counter()
    _, result = sb.score(inp, gw.catalog_input(), today())
    return _json({"ok": True, "persisted": False, "engine": {"version": 2, "computeMs": _ms(t0)}, "input": inp,
                  "result": result})  # fmt: skip


@router.post("/assess")
async def assess(request: Request, gw=Depends(get_gateway)):
    if not _same_origin(request):
        return _fail(403, "cross-origin write rejected")
    body, err = await _body(request)
    if err:
        return err
    try:
        inp = sb.validate_input(body)
    except sb.BadInput as e:
        return _fail(400, "validation failed", str(e))
    t0 = time.perf_counter()
    _, result = sb.score(inp, gw.catalog_input(), today())
    compute = _ms(t0)
    sid, created = _store(gw).save_assessment(inp, result)
    return _json(
        {"ok": True, "persisted": True, "id": sid, "createdAt": created, "engine": {"version": 2, "computeMs": compute},
         "input": inp, "result": result},
        201,
    )  # fmt: skip


@router.get("/assess/{sid}")
def get_assess(sid: str, gw=Depends(get_gateway)):
    if len(sid) != 36 or any(ch not in "0123456789abcdefABCDEF-" for ch in sid):
        return _fail(400, "malformed id")
    row = _store(gw).load_assessment(sid)
    if row is None:
        return _fail(404, "no saved roadmap with that id")
    return _json({"ok": True, "persisted": True, **row})


@router.post("/battery")
async def battery(request: Request, gw=Depends(get_gateway)):
    if not _same_origin(request):
        return _fail(403, "cross-origin write rejected")
    body, err = await _body(request)
    if err:
        return err
    try:
        a = sb.validate_battery(body)
    except sb.BadInput as e:
        return _fail(400, "validation failed", str(e))
    sid, created = _store(gw).save_battery(a)
    return _json(
        {"ok": True, "persisted": True, "id": sid, "createdAt": created,
         "battery": {"version": 1, "model": "battery-1", "byDomain": a["scores"], "meanAptitude": a["mean"],
                     "answered": a["answered"], "total": a["total"]}},
        201,
    )  # fmt: skip


@router.get("/insights")
def insights(gw=Depends(get_gateway)):
    return _json(sb.insights(_store(gw)))


def _ms(t0: float) -> float:
    return round((time.perf_counter() - t0) * 1000, 1)
