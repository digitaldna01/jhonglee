"""Rate limiting, server-side sessions and the chat log (all on the
in-memory cache / SQLite fallback — no services needed)."""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.chat import chatlog, history
from app.core import cache as cache_module
from app.core.config import get_settings
from app.core.ratelimit import RateLimited, RateLimiter
from app.main import app


@pytest.fixture(autouse=True)
def _fresh_state(monkeypatch):
    cache_module._cache = None
    get_settings.cache_clear()
    yield
    cache_module._cache = None
    get_settings.cache_clear()


def test_rate_limiter_counts_and_trips():
    async def run():
        lim = RateLimiter(cache_module.MemoryCache())
        assert [await lim.hit("k", 2, 60) for _ in range(2)] == [1, 2]
        with pytest.raises(RateLimited) as e:
            await lim.hit("k", 2, 60)
        assert e.value.retry_after == 60
        assert await lim.hit("k", 0, 60) == 0  # 0 = disabled

    asyncio.run(run())


def test_history_roundtrip_and_trim():
    async def run():
        assert await history.load("v", "s") == []
        for i in range(history.HISTORY_MAX + 3):
            await history.append("v", "s", f"q{i}", f"a{i}")
        turns = await history.load("v", "s")
        assert len(turns) == history.HISTORY_MAX * 2
        assert turns[-1] == {"role": "assistant", "content": f"a{history.HISTORY_MAX + 2}"}
        assert turns[0]["content"] == "q3"  # oldest exchanges dropped
        await history.clear("v", "s")
        assert await history.load("v", "s") == []

    asyncio.run(run())


def test_chatlog_never_raises_without_table():
    # SQLite fallback with no migrations applied: the write fails and is only logged
    async def run():
        await chatlog.record(
            visitor_id="v", session_id=None, question="q", sources=[], answer="a",
            model="m", retrieval_ms=1.0,
        )

    asyncio.run(run())


def test_stream_sets_cookie_keeps_session_and_rate_limits(monkeypatch):
    monkeypatch.setenv("CHAT_RATE_PER_MINUTE", "3")
    with TestClient(app) as c:
        r1 = c.post("/api/chat/stream", json={"question": "Who are you?", "session_id": "sess1"})
        assert r1.status_code == 200
        assert "jhl_vid" in r1.cookies  # visitor cookie carried onto the streaming response
        vid = r1.cookies["jhl_vid"]

        r2 = c.post("/api/chat/stream", json={"question": "And what do you build?", "session_id": "sess1"})
        assert r2.status_code == 200
        turns = asyncio.run(history.load(vid, "sess1"))
        assert [t["role"] for t in turns] == ["user", "assistant", "user", "assistant"]
        assert turns[0]["content"] == "Who are you?"

        c.post("/api/chat/stream", json={"question": "third"})
        r4 = c.post("/api/chat/stream", json={"question": "fourth"})
        assert r4.status_code == 429 and r4.headers["Retry-After"] == "60"
        assert r4.headers["X-RateLimit-Scope"] == "visitor"


def test_global_daily_cap_trips_after_everyone_combined(monkeypatch):
    monkeypatch.setenv("CHAT_RATE_GLOBAL_PER_DAY", "2")
    with TestClient(app) as c:
        assert c.post("/api/chat/stream", json={"question": "one"}).status_code == 200
        c.cookies.clear()  # a different visitor
        assert c.post("/api/chat/stream", json={"question": "two"}).status_code == 200
        c.cookies.clear()
        r = c.post("/api/chat/stream", json={"question": "three"})
        assert r.status_code == 429 and r.headers["X-RateLimit-Scope"] == "global"
        assert "come back tomorrow" in r.json()["detail"]
        assert r.headers["Retry-After"] == "86400"
