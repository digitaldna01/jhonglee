"""Append-only log of answered questions (chat_logs). Best-effort: a
logging failure must never break the answer that was already streamed."""
from __future__ import annotations

import logging

from ..core.db import session_factory
from .models import ChatLog

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
    try:
        async with session_factory()() as s, s.begin():
            s.add(
                ChatLog(
                    visitor_id=visitor_id,
                    session_id=session_id,
                    question=question,
                    sources=sources,
                    answer=answer,
                    model=model,
                    retrieval_ms=retrieval_ms,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
            )
    except Exception as e:  # noqa: BLE001 — observability must not take down chat
        log.warning("chat log write failed: %s", e)
