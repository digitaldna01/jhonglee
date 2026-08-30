"""Append-only log of answered questions (chat_logs). Best-effort: a
logging failure must never break the answer that was already streamed.
The write itself is the conversation repository's (one writer per table);
this module is the try/except around it."""
from __future__ import annotations

import logging

from .conversation import Source, Turn, get_service
from .conversation.repository import now

log = logging.getLogger(__name__)


async def record(
    *,
    visitor_id: str,
    session_id: str | None,
    question: str,
    sources: list[dict],
    answer: str,
    model: str,
    retrieval_ms: float,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> None:
    turn = Turn(
        question=question,
        answer=answer,
        sources=tuple(Source(s["id"], s.get("title", s["id"]), s.get("kind", ""), s.get("score")) for s in sources),
        model=model,
        retrieval_ms=retrieval_ms,
        created_at=now(),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    try:
        await get_service().record(session_id, visitor_id, turn)
    except Exception as e:  # noqa: BLE001 — observability must not take down chat
        log.warning("chat log write failed: %s", e)
