"""The model's working memory for a conversation, cache-backed (Redis in
production, TTL).

  key      chat:session:{visitor_id}:{session_id}
  value    {"turns": [{"role", "content"}], "last_sources": [doc ids], "started": ts}

The client mints a session_id and sends it with every question; the
server keeps the last HISTORY_MAX exchanges and prefers its own copy over
any history the client still sends (older clients). When the cache has
forgotten a conversation (TTL, restart) the same window is rebuilt from
chat_logs through the conversation service — a conversation's memory is
as durable as its address. Ownership is not checked here: the router has
already done that (conversation.service.begin) before any question is answered.
"""
from __future__ import annotations

import time

import logging

from ..core.cache import get_cache
from ..core.config import get_settings
from .conversation import get_service

log = logging.getLogger(__name__)

HISTORY_MAX = 8  # exchanges (user+assistant pairs) kept per session


def _key(visitor_id: str, session_id: str) -> str:
    return f"chat:session:{visitor_id}:{session_id}"


def _ttl() -> int:
    return get_settings().chat_history_ttl_days * 24 * 3600


async def load_session(visitor_id: str, session_id: str) -> dict:
    """{"turns": [{role, content}, ...] oldest first, "last_sources": [doc ids]}
    — empty turns/sources for an unknown session."""
    data = await get_cache().get(_key(visitor_id, session_id)) or {}
    if data:
        return {"turns": list(data.get("turns", [])), "last_sources": list(data.get("last_sources", []))}
    try:
        turns, last_sources = await get_service().working_memory(session_id, HISTORY_MAX)
    except Exception as e:  # noqa: BLE001 — no log table (dev without migrations): start empty
        log.debug("working memory rebuild skipped: %s", e)
        turns, last_sources = [], []
    return {"turns": turns, "last_sources": last_sources}


async def load(visitor_id: str, session_id: str) -> list[dict]:
    """Just the turns (see load_session)."""
    return (await load_session(visitor_id, session_id))["turns"]


async def append(
    visitor_id: str,
    session_id: str,
    question: str,
    answer: str,
    sources: list[str] | None = None,
) -> None:
    key = _key(visitor_id, session_id)
    cache = get_cache()
    data = await cache.get(key) or {"turns": [], "started": time.time()}
    data["turns"] = (
        data["turns"]
        + [{"role": "user", "content": question}, {"role": "assistant", "content": answer}]
    )[-HISTORY_MAX * 2 :]
    data["last_sources"] = list(sources or [])  # anchors the next turn's retrieval (retrieval.contextual_query)
    await cache.set(key, data, ttl=_ttl())


async def clear(visitor_id: str, session_id: str) -> None:
    await get_cache().delete(_key(visitor_id, session_id))
