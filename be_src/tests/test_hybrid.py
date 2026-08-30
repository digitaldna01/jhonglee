"""Hybrid ranking: keyword tokenisation, BM25 on the MemoryStore, the dense
gate and score fusion — and the golden-set case that motivated it
("What did you build with k-means?" → kmeansVisualizer at rank 1).

The Postgres keyword path (tsvector) runs only with TEST_DATABASE_URL set,
same as tests/test_ingest.py."""
from __future__ import annotations

import asyncio
import os

import numpy as np
import pytest

from app.chat import ingest, retrieval
from app.chat.retrieval.hybrid import rank
from app.chat.store import Hit, MemoryStore, PgVectorStore, _stem, terms, words

DOCS = [
    {
        "id": "kmeans", "kind": "post", "title": "KMeans Clustering", "tags": ["ml"], "url": "/p/k", "node": True,
        "summary": "An interactive k-means visualiser.",
        "chunks": [{"id": "kmeans#0", "heading": None, "text": "k-means centroids are initialised with k-means++ and refined by Lloyd's loop."}],
    },
    {
        "id": "blender", "kind": "post", "title": "Cogs and Gears", "tags": ["3d"], "url": "/p/b", "node": True,
        "summary": "A poem animated in Blender.",
        "chunks": [{"id": "blender#0", "heading": None, "text": "Modelled the gears in Blender; the live demo runs in the browser."}],
    },
]


def _embed(texts: list[str]) -> np.ndarray:
    """Fake embedder: axis 0 = 'kmeans-ness', axis 1 = 'blender-ness'."""
    out = []
    for t in texts:
        t = t.lower()
        v = np.array([("kmeans" in t or "centroid" in t) + 0.1, ("blender" in t or "gear" in t) + 0.1, 0.5], dtype=np.float32)
        out.append(v / np.linalg.norm(v))
    return np.stack(out)


def _store() -> MemoryStore:
    store = MemoryStore()
    asyncio.run(ingest.sync(store, _embed, "fake", DOCS))
    return store


def test_tokeniser_mirrors_postgres_english_config():
    assert words("What did you build with k-means?") == ["k-means", "k", "means"]  # stop + question verbs dropped
    assert terms("k-means clustering libraries") == ["k-mean", "k", "mean", "cluster", "librari"]
    assert terms("k-means로 만들었어?") == ["k-mean", "k", "mean", "로", "만들었어"]  # script boundary
    assert terms("living lives live") == ["live", "live", "live"]
    assert [_stem(w) for w in ("used", "hopping", "centroids", "classes")] == ["use", "hop", "centroid", "class"]
    assert words("Who are you?") == []


def test_memory_keyword_search_is_bm25_best_chunk_per_doc():
    store = _store()

    async def run():
        hits = await store.keyword_search("centroids", 10)
        assert [h.doc_id for h in hits] == ["kmeans"] and not hits[0].is_summary
        assert await store.keyword_search("Tell me more", 10) == []  # nothing but stopwords
        both = await store.keyword_search("Blender k-means", 10)
        assert {h.doc_id for h in both} == {"kmeans", "blender"}

    asyncio.run(run())


def test_rank_gates_keyword_hits_by_dense_and_fuses_scores():
    store = _store()
    embed_query = lambda text: _embed([text])[0]  # noqa: E731

    async def run():
        # dense alone can't tell "initialised" from anything; the keyword hit decides
        top = await rank(store, embed_query, "how were they initialised?", keyword_weight=0.0)
        top_kw = await rank(store, embed_query, "how were they initialised?")
        assert top_kw[0].doc_id == "kmeans" and top_kw[0].hit.text.startswith("k-means centroids")
        assert {r.doc_id for r in top} == {"kmeans", "blender"}
        # gate: a lone token hit on a doc the embedding rates far below the best is ignored
        far = await rank(store, embed_query, "blender gears demo", keyword_gate=0.999)
        assert far[0].doc_id == "blender"
        # fusion="score" keeps the best dense cosine as the display score
        assert all(-1.0 <= r.score <= 1.0 for r in top_kw)
        # follow-up anchor still works with score fusion
        anchored = await rank(store, embed_query, "how?", context_title="Cogs and Gears")
        assert anchored[0].doc_id == "blender"

    asyncio.run(run())


def test_retrieve_fixes_the_k_means_golden_case():
    async def run():
        hits = await retrieval.retrieve("What did you build with k-means?", k=4)
        assert hits[0]["id"] == "kmeansVisualizer"
        assert hits[0]["chunk"] is not None and "kmeans" in hits[0]["chunk"]["text"].lower().replace("-", "")
        # a topic switch is searched un-anchored (rewrite.search_plan) and lands on its own topic
        switched = await retrieval.retrieve("Have you used XGBoost?", k=4)
        assert switched[0]["id"] == "handPoseEstimation"

    asyncio.run(run())


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="needs a migrated Postgres")
def test_pg_keyword_search_uses_tsvector():
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
    from app.core.config import get_settings

    get_settings.cache_clear()
    store = PgVectorStore()

    async def run():
        hits = await store.keyword_search("k-means centroids", 5)
        assert hits and isinstance(hits[0], Hit) and hits[0].doc_id == "kmeansVisualizer"
        assert await store.keyword_search("who are you", 5) == []

    asyncio.run(run())


def test_keyword_query_drops_the_anchored_title_but_never_empties():
    from app.chat.retrieval.hybrid import keyword_query

    q = "What were the initialization methods used in the KMeans Clustering project?"
    assert keyword_query(q, "KMeans Clustering") == "What were the initialization methods used in the project?"
    assert keyword_query(q, None) == q
    assert keyword_query("KMeans Clustering?", "KMeans Clustering") == "KMeans Clustering?"  # only the title: keep it
