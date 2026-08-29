"""Server-side chat sessions, cache-backed (Redis in production, TTL).

  key      chat:session:{visitor_id}:{session_id}
  value    {"turns": [{"role", "content"}], "started": ts}

The client mints a session_id (per page load) and sends it with every
question; the server keeps the last HISTORY_MAX exchanges and prefers
its own copy over any history the client still sends (older clients).
"""
from __future__ import annotations

import time

from ..core.cache import get_cache
from ..core.config import get_settings

HISTORY_MAX = 8  # exchanges (user+assistant pairs) kept per session


def _key(visitor_id: str, session_id: str) -> str:
    return f"chat:session:{visitor_id}:{session_id}"


def _ttl() -> int:
    return get_settings().chat_history_ttl_days * 24 * 3600


async def load(visitor_id: str, session_id: str) -> list[dict]:
    """[{role, content}, ...] oldest first; [] for an unknown session."""
    data = await get_cache().get(_key(visitor_id, session_id))
    return list(data["turns"]) if data else []


async def append(visitor_id: str, session_id: str, question: str, answer: str) -> None:
    key = _key(visitor_id, session_id)
    cache = get_cache()
    data = await cache.get(key) or {"turns": [], "started": time.time()}
    data["turns"] = (
        data["turns"]
        + [{"role": "user", "content": question}, {"role": "assistant", "content": answer}]
    )[-HISTORY_MAX * 2 :]
    await cache.set(key, data, ttl=_ttl())


async def clear(visitor_id: str, session_id: str) -> None:
    await get_cache().delete(_key(visitor_id, session_id))
