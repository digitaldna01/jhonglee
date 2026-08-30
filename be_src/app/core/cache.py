"""Key-value cache with TTL — the seam where Redis plugs in.

Everything ephemeral (chat sessions, rate-limit counters, hot aggregates)
goes through this interface, never through a client library directly.
Two implementations: in-memory (default, single process) and Redis,
selected once per process by REDIS_URL — no call site changes. Values
are JSON-serialisable Python objects.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Protocol

from .config import get_settings


class KVCache(Protocol):
    async def get(self, key: str) -> Any | None: ...
    async def set(self, key: str, value: Any, ttl: int | None = None) -> None: ...
    async def delete(self, key: str) -> None: ...
    async def incr(self, key: str, ttl: int | None = None) -> int: ...
    async def close(self) -> None: ...


class MemoryCache:
    """Process-local cache. Fine for a single uvicorn worker; not shared."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[Any, float | None]] = {}
        self._lock = asyncio.Lock()

    def _alive(self, key: str) -> Any | None:
        item = self._data.get(key)
        if item is None:
            return None
        value, expires = item
        if expires is not None and expires < time.monotonic():
            del self._data[key]
            return None
        return value

    async def get(self, key: str) -> Any | None:
        async with self._lock:
            return self._alive(key)

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        async with self._lock:
            self._data[key] = (value, time.monotonic() + ttl if ttl else None)

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._data.pop(key, None)

    async def incr(self, key: str, ttl: int | None = None) -> int:
        async with self._lock:
            current = self._alive(key) or 0
            value = int(current) + 1
            expires = self._data[key][1] if key in self._data else None
            if expires is None and ttl:
                expires = time.monotonic() + ttl
            self._data[key] = (value, expires)
            return value

    async def close(self) -> None:
        return None


class RedisCache:
    """Redis-backed cache, shared across workers/restarts.

    Values are stored as JSON strings. `incr` relies on Redis INCR, which
    works because json.dumps(int) is the plain integer string, so a counter
    written by `set` and one bumped by `incr` read back the same way.
    """

    def __init__(self, url: str) -> None:
        import redis.asyncio as redis  # only imported when selected

        self._r = redis.from_url(url, decode_responses=True)

    async def get(self, key: str) -> Any | None:
        raw = await self._r.get(key)
        return None if raw is None else json.loads(raw)

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        await self._r.set(key, json.dumps(value), ex=ttl)

    async def delete(self, key: str) -> None:
        await self._r.delete(key)

    async def incr(self, key: str, ttl: int | None = None) -> int:
        value = await self._r.incr(key)
        if ttl and value == 1:  # first write starts the TTL; later bumps keep it
            await self._r.expire(key, ttl)
        return int(value)

    async def close(self) -> None:
        await self._r.aclose()


_cache: KVCache | None = None


def get_cache() -> KVCache:
    """FastAPI dependency / module accessor. Selected once per process."""
    global _cache
    if _cache is None:
        settings = get_settings()
        _cache = RedisCache(settings.redis_url) if settings.redis_url else MemoryCache()
    return _cache


async def close_cache() -> None:
    global _cache
    if _cache is not None:
        await _cache.close()
        _cache = None
