"""Portfolio RAG chat — /api/chat/*.

GET  /api/chat/graph   nodes + similarity edges for the landing map
POST /api/chat/stream  SSE: `sources` (retrieval + timing) → `delta`
                       (answer text chunks) → `done` (model label)
"""

from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from . import service
from .schemas import ChatRequest, GraphResponse

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/graph", response_model=GraphResponse)
def graph():
    return service.graph()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/stream")
def stream(req: ChatRequest):
    history = [t.model_dump() for t in req.history]
    events = (
        _sse(name, payload) for name, payload in service.answer(req.question, history)
    )
    return StreamingResponse(
        events,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # keep nginx from buffering the stream
        },
    )
