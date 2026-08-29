"""Portfolio RAG chat — /api/chat/*.

GET  /api/chat/graph   nodes + similarity edges for the landing map
POST /api/chat/stream  SSE: `sources` (retrieval + timing) → `delta`
                       (answer text chunks) → `done` (model label)
                       429 (+Retry-After) when the visitor/IP rate limit trips
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from ..core.cache import get_cache
from ..core.config import get_settings
from ..core.deps import get_client_ip, get_visitor_id
from ..core.ratelimit import RateLimited, RateLimiter
from . import service
from .schemas import ChatRequest, GraphResponse

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/graph", response_model=GraphResponse)
def graph():
    return service.graph()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _rate_limit(request: Request, visitor_id: str = Depends(get_visitor_id)) -> str:
    """Per-visitor and per-IP fixed windows; both must pass. Returns the visitor id."""
    settings = get_settings()
    limiter = RateLimiter(get_cache())
    ip = get_client_ip(request)
    try:
        for who in (f"v:{visitor_id}", f"ip:{ip}"):
            await limiter.hit(f"rl:chat:min:{who}", settings.chat_rate_per_minute, 60)
            await limiter.hit(f"rl:chat:day:{who}", settings.chat_rate_per_day, 86400)
    except RateLimited as e:
        raise HTTPException(
            status_code=429,
            detail="Too many questions — please wait a moment.",
            headers={"Retry-After": str(e.retry_after)},
        ) from None
    return visitor_id


@router.post("/stream")
async def stream(req: ChatRequest, response: Response, visitor_id: str = Depends(_rate_limit)):
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
