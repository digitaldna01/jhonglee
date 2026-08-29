"""core.cache — MemoryCache behaviour and backend selection by REDIS_URL."""
from __future__ import annotations

import asyncio

import pytest

from app.core import cache as cache_module
from app.core.config import get_settings


@pytest.fixture(autouse=True)
def _reset_cache(monkeypatch):
    """Each test picks its backend from a clean slate."""
    cache_module._cache = None
    get_settings.cache_clear()
    yield
    cache_module._cache = None
    get_settings.cache_clear()


def test_memory_cache_roundtrip_and_incr():
    async def run():
        c = cache_module.MemoryCache()
        await c.set("k", {"a": 1}, ttl=60)
        assert await c.get("k") == {"a": 1}
        await c.delete("k")
        assert await c.get("k") is None
        assert await c.incr("n", ttl=60) == 1
        assert await c.incr("n") == 2
        await c.close()

    asyncio.run(run())


def test_memory_cache_expires(monkeypatch):
    async def run():
        c = cache_module.MemoryCache()
        await c.set("k", 1, ttl=10)
        now = cache_module.time.monotonic()
        monkeypatch.setattr(cache_module.time, "monotonic", lambda: now + 11)
        assert await c.get("k") is None

    asyncio.run(run())


def test_selects_memory_without_redis_url(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert isinstance(cache_module.get_cache(), cache_module.MemoryCache)


def test_selects_redis_with_redis_url(monkeypatch):
    # redis.asyncio connects lazily, so constructing the client needs no server
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    assert isinstance(cache_module.get_cache(), cache_module.RedisCache)
