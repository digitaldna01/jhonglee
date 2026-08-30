"""Portfolio RAG chat — /api/chat/*.

GET  /api/chat/graph       nodes + similarity edges for the landing map
POST /api/chat/stream      SSE: `sources` (retrieval + timing) → `delta`
                           (answer text chunks) → `done` (model label, session_id)
                           429 (+Retry-After) when the visitor/IP rate limit trips
                           403 when session_id is another visitor's conversation
GET  /api/chat/sessions/*  the transcript by address — conversation/router.py
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse

from ..core.auth import Principal, get_principal
from ..core.cache import get_cache
from ..core.config import get_settings
from ..core.deps import get_client_ip, get_visitor_id
from ..core.ratelimit import RateLimited, RateLimiter
from . import service
from .conversation import Forbidden, get_service
from .conversation.router import router as sessions_router
from .schemas import ChatRequest, GraphResponse

log = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])
router.include_router(sessions_router)


@router.get("/graph", response_model=GraphResponse)
def graph(
    z: float | None = Query(default=None, ge=0.0, le=4.0, description="edge σ floor (experiment knob)"),
    k: int | None = Query(default=None, ge=0, le=10, description="mutual-kNN size, 0 = off (experiment knob)"),
):
    return service.graph(z, k)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


LIMIT_MESSAGES = {
    "global": "The assistant has answered a lot of questions today and is taking a rest — please come back tomorrow.",
    "visitor": "Too many questions — please wait a moment.",
    "ip": "Too many questions — please wait a moment.",
}


async def _rate_limit(request: Request, visitor_id: str = Depends(get_visitor_id)) -> str:
    """Per-visitor, per-IP and site-wide fixed windows; all must pass.
    Returns the visitor id. The site-wide daily cap is the hard ceiling on
    the Claude bill (cap × cost per answer); it is counted last so one
    abuser trips their own limit before eating into everyone's budget."""
    settings = get_settings()
    limiter = RateLimiter(get_cache())
    ip = get_client_ip(request)
    try:
        for scope, who in (("visitor", f"v:{visitor_id}"), ("ip", f"ip:{ip}")):
            await limiter.hit(f"rl:chat:min:{who}", settings.chat_rate_per_minute, 60, scope=scope)
            await limiter.hit(f"rl:chat:day:{who}", settings.chat_rate_per_day, 86400, scope=scope)
        await limiter.hit("rl:chat:day:global", settings.chat_rate_global_per_day, 86400, scope="global")
    except RateLimited as e:
        raise HTTPException(
            status_code=429,
            detail=LIMIT_MESSAGES.get(e.scope, LIMIT_MESSAGES["visitor"]),
            headers={"Retry-After": str(e.retry_after), "X-RateLimit-Scope": e.scope},
        ) from None
    return visitor_id


async def _claim_address(who: Principal, session_id: str) -> None:
    """Claim a new address, or prove this one is ours — before any streaming.
    Only a refusal stops the answer: with the session table unavailable (dev
    without migrations, a database outage) the question is still answered,
    like chatlog's best-effort write, and the gap is logged."""
    try:
        await get_service().begin(who, session_id)
    except Forbidden:
        raise HTTPException(403, "this conversation belongs to another visitor") from None
    except Exception as e:  # noqa: BLE001
        log.warning("conversation bookkeeping skipped: %s", e)


@router.post("/stream")
async def stream(
    req: ChatRequest,
    response: Response,
    visitor_id: str = Depends(_rate_limit),
    who: Principal = Depends(get_principal),
):
    if req.session_id:
        await _claim_address(who, req.session_id)
    client_history = [t.model_dump() for t in req.history]

    async def events():
        async for name, payload in service.answer(
            req.question, client_history, visitor_id=visitor_id, session_id=req.session_id
        ):
            yield _sse(name, payload)

    out = StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # keep nginx from buffering the stream
        },
    )
    # a Response returned directly does not inherit dependency headers — carry
    # the visitor cookie (set by get_visitor_id on first sight) across by hand
    out.raw_headers.extend(h for h in response.raw_headers if h[0] == b"set-cookie")
    return out
