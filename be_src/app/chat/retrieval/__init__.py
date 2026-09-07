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
import re

import numpy as np

from ...content.repository import NODES, by_id
from ...core.config import get_settings
from .. import embedding, ingest
from ..store import VectorStore, select_store
from . import reranker
from .edges import EDGE_K, EDGE_Z, build_edges
from .hybrid import CONTEXT_WEIGHT, KEYWORD_WEIGHT, RRF_K, Ranked, contextual_query, rank, rrf

__all__ = [
    "CONTEXT_WEIGHT", "KEYWORD_WEIGHT", "RRF_K",
    "contextual_query", "edges", "rank", "retrieve", "rrf", "warmup",
]

log = logging.getLogger(__name__)

_model = None
_store: VectorStore | None = None
_edges: list[dict] | None = None
_summary_vecs: dict[str, np.ndarray] = {}  # kept so edges can be re-derived with another z
_reranker = None  # cross-encoder; None = disabled (RERANK_MODEL="")


def _embed_passages(texts: list[str]) -> np.ndarray:
    return embedding.embed_passages(_model, texts)


def _embed_query(text: str) -> np.ndarray:
    return embedding.embed_query(_model, text)


async def warmup() -> ingest.SyncReport:
    """Load the model, sync the vector index, derive graph edges (app startup)."""
    global _model, _store, _edges, _summary_vecs, _reranker
    settings = get_settings()
    if _model is None:
        _model = await asyncio.to_thread(embedding.load, settings.embed_model)
    if _reranker is None and settings.rerank_model:
        _reranker = await asyncio.to_thread(reranker.load, settings.rerank_model)
    if _store is None:
        _store = select_store(settings.database_url)
    report = await ingest.sync(_store, _embed_passages, settings.embed_model)
    _summary_vecs = await _store.summary_vectors()
    _edges = build_edges(NODES, _summary_vecs)
    log.info("%s [%s]", report, type(_store).__name__)
    return report


def edges(z: float | None = None, k: int | None = None) -> list[dict]:
    """Similarity edges for the landing map; `z` overrides the σ floor and `k`
    the mutual-kNN size (experiment knobs — the defaults are what the map
    ships with; k=0 drops the reciprocity rule)."""
    if _edges is None:
        raise RuntimeError("retrieval.warmup() has not run")
    if z is None and k is None:
        return _edges
    return build_edges(NODES, _summary_vecs, z=EDGE_Z if z is None else z, k=EDGE_K if k is None else k)


async def _ready() -> VectorStore:
    """The live store, warming up on first use (uvicorn without lifespan, tests)."""
    if _store is None:
        await warmup()
    assert _store is not None
    return _store


_ENUMERATION = re.compile(
    r"\b(list|all|every|each|how many|count|overview"
    r"|what (have|did) you (made|make|built|build|done|do))\b|전부|모두|모든|다 |목록|몇 개|어떤 프로젝트|뭐 만들었",
    re.I,
)


def is_enumeration(question: str) -> bool:
    """Does the question ask for the projects as a set (list / count / what
    have you made)? Only then may the generated index document compete."""
    return bool(_ENUMERATION.search(question))


async def reranked(
    question: str, ranked: list[Ranked], encoder=None, gate: float = reranker.GATE
) -> list[Ranked]:
    """`ranked` with its head re-ordered by the cross-encoder (reranker.py):
    candidates the encoder confidently relates to the question move up, the
    rest keep the fused order. Unchanged when reranking is off or the
    question is not English."""
    encoder = encoder or _reranker
    if encoder is None or len(ranked) < 2 or not reranker.applies(question):
        return ranked
    head = ranked[: reranker.CANDIDATES]
    passages = []
    for r in head:
        doc = by_id(r.doc_id)
        title = doc["title"] if doc else r.doc_id
        passages.append(reranker.passage(title, r.hit.heading, r.hit.text))
    scored = await asyncio.to_thread(reranker.scores, encoder, question, passages)
    return [head[i] for i in reranker.order(scored, gate)] + ranked[len(head):]


async def retrieve(question: str, k: int = 4, *, context_title: str | None = None) -> list[dict]:
    """Top-k documents for a question (hybrid.rank over the live store,
    cross-encoder reranked — see reranker.py).

    In a conversation, pass the title of the previous turn's top source as
    `context_title` so elliptical follow-ups recover their topic.

    Returns [{id, kind, title, score, chunk: {heading, text}}] — `score`
    is the best cosine seen for the doc, `chunk` the chunk to quote
    (None if a summary won).
    """
    store = await _ready()
    out = []
    enumerating = is_enumeration(question)
    ranked = await rank(store, _embed_query, question, context_title=context_title)
    # an anchored query ("tell me more about it" + the previous title) names no
    # topic itself — the cross-encoder would score noise and undo the anchor
    if context_title is None:
        ranked = await reranked(question, ranked)
    for r in ranked:
        doc = by_id(r.doc_id)
        if doc is None:  # index ahead of corpus.json (shouldn't happen after sync)
            continue
        if doc["kind"] == "index" and not enumerating:
            continue  # the generated title list answers enumeration only; elsewhere it just steals a slot
        if len(out) == k:
            break
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
