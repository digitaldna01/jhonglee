"""Conversations by address: the access table (policy), the use cases over a
memory repository (service), the SQL repository on a throwaway SQLite file,
and the HTTP surface end to end (stream → GET, another visitor, the owner)."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.chat.conversation import ConversationService, Forbidden, NotFound, Source, Turn, policy
from app.chat.conversation.repository import MemoryConversationRepository, SqlConversationRepository
from app.chat.conversation.service import reset_service
from app.chat.models import ChatLog, ChatSession
from app.core import cache as cache_module
from app.core import db as db_module
from app.core.auth import Owner, Visitor
from app.core.config import get_settings
from app.main import app

T0 = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)
ANN, BOB = Visitor("ann"), Visitor("bob")
BOSS = Owner("boss")


def turn(q: str, a: str = "…", *, at: datetime = T0, sources=("gillSans",)) -> Turn:
    return Turn(q, a, tuple(Source(s, s.title()) for s in sources), "m", 1.0, at)


@pytest.fixture(autouse=True)
def _fresh_state(monkeypatch, tmp_path):
    cache_module._cache = None
    get_settings.cache_clear()
    reset_service()
    yield
    cache_module._cache = None
    get_settings.cache_clear()
    reset_service()


# ------------------------------------------------------------ policy


def test_policy_table():
    conv = object()
    assert policy.can_read(BOB, conv) and policy.can_read(ANN, conv) and policy.can_read(BOSS, conv)
    assert not policy.can_read(BOSS, None)  # unknown is unknown even to the owner
    assert policy.can_continue(ANN, None)  # unclaimed: first asker takes it
    assert policy.can_continue(ANN, "ann") and not policy.can_continue(BOB, "ann")
    assert not policy.can_continue(BOSS, "ann")  # the owner reads, does not speak for others
    assert policy.can_list_all(BOSS) and not policy.can_list_all(ANN)
    assert policy.can_see_visitor(BOSS) and not policy.can_see_visitor(ANN)


# ----------------------------------------------------------- service


def _service() -> tuple[ConversationService, MemoryConversationRepository]:
    repo = MemoryConversationRepository()
    return ConversationService(repo), repo


def test_begin_claims_then_guards_the_address():
    async def run():
        svc, _ = _service()
        await svc.begin(ANN, "s1", T0)
        await svc.begin(ANN, "s1", T0 + timedelta(minutes=1))  # continuing is fine
        with pytest.raises(Forbidden):
            await svc.begin(BOB, "s1")
        with pytest.raises(Forbidden):
            await svc.begin(BOSS, "s1")

    asyncio.run(run())


def test_view_is_read_for_anyone_continue_for_the_owner_404_for_unknown():
    async def run():
        svc, repo = _service()
        await svc.begin(ANN, "s1", T0)
        await repo.add_turn("s1", "ann", turn("Who are you?  ", at=T0))
        await repo.add_turn("s1", "ann", turn("And your ML work?", at=T0 + timedelta(seconds=30)))

        mine = await svc.view(ANN, "s1")
        assert mine.can_continue and not mine.show_visitor
        assert mine.conversation.title == "Who are you?"
        assert [t.question for t in mine.conversation.turns] == ["Who are you?  ", "And your ML work?"]

        theirs = await svc.view(BOB, "s1")
        assert not theirs.can_continue
        boss = await svc.view(BOSS, "s1")
        assert boss.show_visitor and not boss.can_continue

        with pytest.raises(NotFound):
            await svc.view(BOSS, "nope")

    asyncio.run(run())


def test_lists_mine_and_all_with_titles_and_counts():
    async def run():
        svc, repo = _service()
        await svc.begin(ANN, "a1", T0)
        await repo.add_turn("a1", "ann", turn("first"))
        await repo.add_turn("a1", "ann", turn("second"))
        await svc.begin(BOB, "b1", T0 + timedelta(hours=1))
        await repo.add_turn("b1", "bob", turn("x" * 200))

        mine = await svc.mine(ANN)
        assert [(c.id, c.title, c.turn_count) for c in mine] == [("a1", "first", 2)]
        with pytest.raises(Forbidden):
            await svc.all(ANN)
        everything = await svc.all(BOSS)
        assert [c.id for c in everything] == ["b1", "a1"]  # newest activity first
        assert len(everything[0].title) == 80 and everything[0].title.endswith("…")
        page2 = await svc.all(BOSS, before=everything[0].last_at)
        assert [c.id for c in page2] == ["a1"]

    asyncio.run(run())


def test_working_memory_is_the_last_n_turns_as_model_history():
    async def run():
        svc, repo = _service()
        for i in range(10):
            await repo.add_turn("s", "ann", turn(f"q{i}", f"a{i}", sources=(f"doc{i}",)))
        history, last_sources = await svc.working_memory("s", 3)
        assert [h["content"] for h in history] == ["q7", "a7", "q8", "a8", "q9", "a9"]
        assert last_sources == ["doc9"]
        assert await svc.working_memory("nothing") == ([], [])

    asyncio.run(run())


# --------------------------------------------------------------- SQL


def test_sql_repository_roundtrip(tmp_path):
    async def run():
        engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/c.db")
        async with engine.begin() as conn:
            await conn.run_sync(lambda c: ChatSession.__table__.create(c))
            await conn.run_sync(lambda c: ChatLog.__table__.create(c))
        repo = SqlConversationRepository(async_sessionmaker(engine, expire_on_commit=False))

        assert await repo.owner_of("s1") is None and await repo.get("s1") is None
        await repo.touch("s1", "ann", T0)
        await repo.touch("s1", "bob", T0 + timedelta(minutes=5))  # cannot steal: only last_at moves
        assert await repo.owner_of("s1") == "ann"
        await repo.add_turn("s1", "ann", turn("Who are you?", "Jae.", at=T0, sources=("gillSans", "cogsAndGears")))
        await repo.add_turn("s1", "ann", turn("More?", "Sure.", at=T0 + timedelta(minutes=5)))
        await repo.add_turn(None, "ann", turn("no session", "ok"))  # older clients: logged, unaddressed

        c = await repo.get("s1")
        assert c and c.visitor_id == "ann" and c.last_at == T0 + timedelta(minutes=5)
        assert [t.question for t in c.turns] == ["Who are you?", "More?"]
        assert [s.title for s in c.turns[0].sources] == ["Gillsans", "Cogsandgears"]
        assert c.turns[0].created_at.tzinfo is not None

        assert [t.question for t in await repo.recent_turns("s1", 1)] == ["More?"]
        mine = await repo.list_for("ann", 10)
        assert [(m.id, m.title, m.turn_count) for m in mine] == [("s1", "Who are you?", 2)]
        assert await repo.list_for("bob", 10) == []
        assert [m.id for m in await repo.list_all(10, None)] == ["s1"]
        assert await repo.list_all(10, T0) == []
        await engine.dispose()

    asyncio.run(run())


# -------------------------------------------------------------- HTTP


@pytest.fixture
def client(monkeypatch, tmp_path):
    """The app on a fresh SQLite file with the two chat tables created —
    the real repository, no migrations needed."""
    url = f"sqlite+aiosqlite:///{tmp_path}/app.db"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("OWNER_TOKEN", "open-sesame")
    get_settings.cache_clear()
    asyncio.run(db_module.dispose())

    async def create():
        engine = create_async_engine(url)
        async with engine.begin() as conn:
            await conn.run_sync(lambda c: ChatSession.__table__.create(c))
            await conn.run_sync(lambda c: ChatLog.__table__.create(c))
        await engine.dispose()

    asyncio.run(create())
    with TestClient(app) as c:
        yield c
    asyncio.run(db_module.dispose())


def test_stream_claims_the_address_and_get_reads_it_back(client):
    r = client.post("/api/chat/stream", json={"question": "Who are you?", "session_id": "conv-1"})
    assert r.status_code == 200
    done = [l for l in r.text.splitlines() if l.startswith("data:")][-1]
    assert '"session_id": "conv-1"' in done

    c = client.get("/api/chat/sessions/conv-1").json()
    assert c["id"] == "conv-1" and c["title"] == "Who are you?" and c["can_continue"] is True
    assert c["visitor_id"] is None  # not the owner
    assert len(c["turns"]) == 1 and c["turns"][0]["question"] == "Who are you?"
    assert c["turns"][0]["sources"] and c["turns"][0]["model"]

    mine = client.get("/api/chat/sessions").json()
    assert [(m["id"], m["turn_count"]) for m in mine] == [("conv-1", 1)]
    assert client.get("/api/chat/sessions/never").status_code == 404
    assert client.get("/api/chat/sessions?scope=all").status_code == 403


def test_another_visitor_reads_but_cannot_continue(client):
    client.post("/api/chat/stream", json={"question": "Who are you?", "session_id": "conv-2"})
    client.cookies.clear()  # a different browser
    c = client.get("/api/chat/sessions/conv-2").json()
    assert c["can_continue"] is False and c["turns"][0]["question"] == "Who are you?"
    r = client.post("/api/chat/stream", json={"question": "hijack", "session_id": "conv-2"})
    assert r.status_code == 403
    assert len(client.get("/api/chat/sessions/conv-2").json()["turns"]) == 1
    assert client.get("/api/chat/sessions").json() == []  # nothing of their own yet


def test_owner_logs_in_and_sees_everything(client):
    client.post("/api/chat/stream", json={"question": "Who are you?", "session_id": "conv-3"})
    client.cookies.clear()
    assert client.get("/api/auth/me").json() == {"owner": False}
    assert client.post("/api/auth/owner", json={"token": "wrong"}).status_code == 401
    assert client.post("/api/auth/owner", json={"token": "open-sesame"}).status_code == 204
    assert client.get("/api/auth/me").json() == {"owner": True}

    rows = client.get("/api/chat/sessions?scope=all").json()
    assert [r["id"] for r in rows] == ["conv-3"] and rows[0]["visitor_id"]
    c = client.get("/api/chat/sessions/conv-3").json()
    assert c["visitor_id"] and c["can_continue"] is False

    assert client.delete("/api/auth/owner").status_code == 204
    assert client.get("/api/auth/me").json() == {"owner": False}


def test_owner_login_is_disabled_without_a_token(client, monkeypatch):
    monkeypatch.setenv("OWNER_TOKEN", "")
    get_settings.cache_clear()
    assert client.post("/api/auth/owner", json={"token": "x"}).status_code == 404


def test_working_memory_survives_a_forgotten_cache(client):
    client.post("/api/chat/stream", json={"question": "Who are you?", "session_id": "conv-4"})
    cache_module._cache = None  # Redis "restart": the working memory is gone, the log is not
    from app.chat import history

    vid = client.cookies["jhl_vid"]
    session = asyncio.run(history.load_session(vid, "conv-4"))
    assert [t["role"] for t in session["turns"]] == ["user", "assistant"]
    assert session["turns"][0]["content"] == "Who are you?" and session["last_sources"]
