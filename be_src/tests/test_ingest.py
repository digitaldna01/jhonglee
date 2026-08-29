"""chat.ingest + chat.store — incremental sync semantics.

The MemoryStore tests need no model or database (a fake embed function).
The Postgres test runs only when TEST_DATABASE_URL points at a database
with the migrations applied (e.g. the docker-compose dev stack):

    TEST_DATABASE_URL=postgresql+asyncpg://jhonglee:<pw>@localhost:5433/jhonglee pytest
"""
from __future__ import annotations

import asyncio
import os

import numpy as np
import pytest

from app.chat import ingest
from app.chat.store import MemoryStore, PgVectorStore

DOCS = [
    {
        "id": "alpha",
        "kind": "project",
        "title": "Alpha",
        "tags": ["a"],
        "summary": "Alpha summary.",
        "url": "/posts/alpha",
        "node": True,
        "chunks": [{"id": "alpha#0", "heading": None, "text": "Alpha body one."}],
    },
    {
        "id": "beta",
        "kind": "post",
        "title": "Beta",
        "tags": ["b"],
        "summary": "Beta summary.",
        "url": "/posts/beta",
        "node": True,
        "chunks": [],
    },
]


def fake_embed(texts: list[str]) -> np.ndarray:
    """Deterministic 384-d vectors: a passage always embeds the same way."""
    out = []
    for t in texts:
        rng = np.random.default_rng(abs(hash(t)) % (2**32))
        out.append(rng.standard_normal(384).astype(np.float32))
    return np.stack(out)


def test_plan_ids_follow_content_and_model():
    a = ingest.plan("m1", DOCS)
    assert [r.id.split("#")[0] for r in a] == ["alpha", "alpha", "beta"]
    assert a[0].is_summary and not a[1].is_summary
    assert ingest.plan("m1", DOCS) == a  # deterministic
    assert {r.id for r in ingest.plan("m2", DOCS)}.isdisjoint({r.id for r in a})  # model change → all new


def test_memory_sync_is_incremental():
    async def run():
        store = MemoryStore()
        r1 = await ingest.sync(store, fake_embed, "m1", DOCS)
        assert (r1.added, r1.removed, r1.unchanged) == (3, 0, 0)

        r2 = await ingest.sync(store, fake_embed, "m1", DOCS)
        assert (r2.added, r2.removed, r2.unchanged) == (0, 0, 3)

        # edit one chunk, drop one doc: only the edited chunk is embedded
        edited = [
            {**DOCS[0], "chunks": [{"id": "alpha#0", "heading": None, "text": "Alpha body CHANGED."}]},
        ]
        r3 = await ingest.sync(store, fake_embed, "m1", edited)
        assert (r3.added, r3.removed, r3.unchanged) == (1, 2, 1)
        assert set(await store.summary_vectors()) == {"alpha"}

        hits = await store.search(fake_embed(["From Alpha (project; a): Alpha body CHANGED."])[0], k=5)
        assert hits[0].doc_id == "alpha" and hits[0].text == "Alpha body CHANGED."
        assert hits[0].score == pytest.approx(1.0, abs=1e-5)

    asyncio.run(run())


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="needs Postgres (TEST_DATABASE_URL)")
def test_pgvector_sync_and_search(monkeypatch):
    from app.core import db
    from app.core.config import get_settings

    monkeypatch.setenv("DATABASE_URL", os.environ["TEST_DATABASE_URL"])
    get_settings.cache_clear()

    async def run():
        await db.dispose()
        store = PgVectorStore()
        try:
            r1 = await ingest.sync(store, fake_embed, "test-model", DOCS)
            r2 = await ingest.sync(store, fake_embed, "test-model", DOCS)
            assert r1.added == 3 and r2.added == 0 and r2.unchanged == 3
            assert set(await store.summary_vectors()) == {"alpha", "beta"}
            hits = await store.search(fake_embed(["From Beta (post; b): Beta summary."])[0], k=2)
            assert hits[0].doc_id == "beta" and hits[0].is_summary
            assert hits[0].score == pytest.approx(1.0, abs=1e-4)
        finally:
            await store.apply([], [], await store.existing_chunk_ids())  # leave the table clean
            await db.dispose()

    asyncio.run(run())
    get_settings.cache_clear()
