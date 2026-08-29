"""Fixed-window rate limiting on top of core.cache (Redis in production).

    limiter = RateLimiter(get_cache())
    await limiter.hit("chat:min:visitor:abc", limit=10, window=60)  # raises RateLimited

One INCR per window key; the first hit starts the TTL, so a key expires
`window` seconds after the window opened. Coarse but cheap, and enough
to keep a public LLM endpoint from being farmed.
"""
from __future__ import annotations

from dataclasses import dataclass

from .cache import KVCache


@dataclass
class RateLimited(Exception):
    scope: str
    limit: int
    window: int

    @property
    def retry_after(self) -> int:  # seconds; the window is the upper bound
        return self.window


class RateLimiter:
    def __init__(self, cache: KVCache) -> None:
        self._cache = cache

    async def hit(self, key: str, limit: int, window: int) -> int:
        """Count one request against `key`; return the count or raise RateLimited."""
        if limit <= 0:
            return 0
        n = await self._cache.incr(key, ttl=window)
        if n > limit:
            raise RateLimited(scope=key, limit=limit, window=window)
        return n
