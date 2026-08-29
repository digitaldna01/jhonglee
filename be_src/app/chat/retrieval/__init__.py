"""Retrieval over the portfolio corpus — the "R" in RAG.

  __init__   state (model, store, edges) + warmup() / edges() / retrieve()
  hybrid     the ranking: dense + keyword (+ follow-up anchor), score fusion
  edges      graph edges for the landing map, from the summary vectors

Chunk-level retrieval with template-generated contextual embeddings (see
ingest.passage_text). Embeddings come from fastembed (ONNX, no torch —
Raspberry-Pi friendly; model selection in embedding.py); vectors and the
keyword index live in the store selected by DATABASE_URL (pgvector +
tsvector in production, numpy + BM25 in-process otherwise — store.py).
`warmup()` loads the model, syncs the index incrementally and derives the
graph edges.
"""
from __future__ import annotations

import asyncio
import logging

import numpy as np

from ...content.repository import NODES, by_id
from ...core.config import get_settings
from .. import embedding, ingest
from ..store import VectorStore, select_store
from .edges import build_edges
from .hybrid import CONTEXT_WEIGHT, KEYWORD_WEIGHT, RRF_K, contextual_query, rank, rrf

__all__ = [
    "CONTEXT_WEIGHT", "KEYWORD_WEIGHT", "RRF_K",
    "contextual_query", "edges", "rank", "retrieve", "rrf", "warmup",
]

log = logging.getLogger(__name__)

_model = None
_store: VectorStore | None = None
_edges: list[dict] | None = None
_summary_vecs: dict[str, np.ndarray] = {}  # kept so edges can be re-derived with another z


def _embed_passages(texts: list[str]) -> np.ndarray:
    return embedding.embed_passages(_model, texts)


def _embed_query(text: str) -> np.ndarray:
    return embedding.embed_query(_model, text)


async def warmup() -> ingest.SyncReport:
    """Load the model, sync the vector index, derive graph edges (app startup)."""
    global _model, _store, _edges, _summary_vecs
    settings = get_settings()
    if _model is None:
        _model = await asyncio.to_thread(embedding.load, settings.embed_model)
    if _store is None:
        _store = select_store(settings.database_url)
    report = await ingest.sync(_store, _embed_passages, settings.embed_model)
    _summary_vecs = await _store.summary_vectors()
    _edges = build_edges(NODES, _summary_vecs)
    log.info("%s [%s]", report, type(_store).__name__)
    return report


def edges(z: float | None = None) -> list[dict]:
    """Similarity edges for the landing map; `z` overrides the σ threshold
    (an experiment knob — the default is what the map ships with)."""
    if _edges is None:
        raise RuntimeError("retrieval.warmup() has not run")
    return _edges if z is None else build_edges(NODES, _summary_vecs, z=z)


async def _ready() -> VectorStore:
    """The live store, warming up on first use (uvicorn without lifespan, tests)."""
    if _store is None:
        await warmup()
    assert _store is not None
    return _store


async def retrieve(question: str, k: int = 4, *, context_title: str | None = None) -> list[dict]:
    """Top-k documents for a question (hybrid.rank over the live store).

    In a conversation, pass the title of the previous turn's top source as
    `context_title` so elliptical follow-ups recover their topic.

    Returns [{id, kind, title, score, chunk: {heading, text}}] — `score`
    is the best cosine seen for the doc, `chunk` the chunk to quote
    (None if a summary won).
    """
    store = await _ready()
    out = []
    for r in (await rank(store, _embed_query, question, context_title=context_title))[:k]:
        doc = by_id(r.doc_id)
        if doc is None:  # index ahead of corpus.json (shouldn't happen after sync)
            continue
        out.append(
            {
                "id": doc["id"],
                "kind": doc["kind"],
                "title": doc["title"],
                "score": r.score,
                "chunk": None if r.hit.is_summary else {"heading": r.hit.heading, "text": r.hit.text},
            }
        )
    return out
