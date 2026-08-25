"""Key-value cache with TTL — the seam where Redis plugs in.

Everything ephemeral (chat sessions, rate-limit counters, hot aggregates)
goes through this interface, never through a client library directly.
Today there is one implementation, in-memory; when REDIS_URL is set a
Redis-backed one will be selected here (and only here) — no call site
changes. Values are JSON-serialisable Python objects.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Protocol

from .config import get_settings


class KVCache(Protocol):
    async def get(self, key: str) -> Any | None: ...
    async def set(self, key: str, value: Any, ttl: int | None = None) -> None: ...
    async def delete(self, key: str) -> None: ...
    async def incr(self, key: str, ttl: int | None = None) -> int: ...


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


_cache: KVCache | None = None


def get_cache() -> KVCache:
    """FastAPI dependency / module accessor. Selected once per process."""
    global _cache
    if _cache is None:
        settings = get_settings()
        if settings.redis_url:
            # TODO(redis): return RedisCache(settings.redis_url) once redis is
            # added to requirements and docker-compose. Until then, be loud.
            raise RuntimeError("REDIS_URL is set but the Redis cache is not implemented yet")
        _cache = MemoryCache()
    return _cache
