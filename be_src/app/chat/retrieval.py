"""Semantic retrieval over the portfolio corpus — the "R" in RAG.

Chunk-level retrieval with template-generated contextual embeddings
(see ingest.passage_text). A document's score is the max over its
chunks; the best chunk rides along for the answer context.

Embeddings come from fastembed (ONNX, no torch — Raspberry-Pi friendly);
vectors live in the store selected by DATABASE_URL (pgvector in
production, numpy in-process otherwise — see store.py). `warmup()` loads
the model, syncs the index incrementally and derives the graph edges.
"""
from __future__ import annotations

import asyncio
import logging

import numpy as np

from ..content.repository import NODES, by_id
from ..core.config import get_settings
from . import ingest
from .store import VectorStore, select_store

log = logging.getLogger(__name__)

# Each graph node links to its top-MAX most similar peers. Real-embedding
# cosines cluster high, so raw scores are rescaled into the weight band
# the force layout was tuned for.
_EDGE_MAX_PER_NODE = 2

_model = None
_store: VectorStore | None = None
_edges: list[dict] | None = None


def _load_model():
    from fastembed import TextEmbedding

    return TextEmbedding(get_settings().embed_model)


def _embed_passages(texts: list[str]) -> np.ndarray:
    return np.stack([np.asarray(v, dtype=np.float32) for v in _model.passage_embed(texts)])


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b)) or 1.0
    return float(np.dot(a, b)) / denom


def _build_edges(doc_vecs: dict[str, np.ndarray]) -> list[dict]:
    nodes = [d for d in NODES if d["id"] in doc_vecs]  # corpus order → stable output
    raw: dict[tuple[int, int], float] = {}
    for ai, a in enumerate(nodes):
        sims = sorted(
            (
                (bi, _cosine(doc_vecs[a["id"]], doc_vecs[b["id"]]))
                for bi, b in enumerate(nodes)
                if bi != ai
            ),
            key=lambda x: x[1],
            reverse=True,
        )[:_EDGE_MAX_PER_NODE]
        for bi, s in sims:
            key = (ai, bi) if ai < bi else (bi, ai)
            raw[key] = max(raw.get(key, 0.0), s)

    if not raw:
        return []
    lo, hi = min(raw.values()), max(raw.values())
    span = (hi - lo) or 1.0
    return [
        {
            "a": nodes[ai]["id"],
            "b": nodes[bi]["id"],
            "w": round(0.15 + 0.7 * ((s - lo) / span), 3),
        }
        for (ai, bi), s in sorted(raw.items())
    ]


async def warmup() -> ingest.SyncReport:
    """Load the model, sync the vector index, derive graph edges (app startup)."""
    global _model, _store, _edges
    settings = get_settings()
    if _model is None:
        _model = await asyncio.to_thread(_load_model)
    if _store is None:
        _store = select_store(settings.database_url)
    report = await ingest.sync(_store, _embed_passages, settings.embed_model)
    _edges = _build_edges(await _store.summary_vectors())
    log.info("%s [%s]", report, type(_store).__name__)
    return report


def edges() -> list[dict]:
    if _edges is None:
        raise RuntimeError("retrieval.warmup() has not run")
    return _edges


async def retrieve(question: str, k: int = 4) -> list[dict]:
    """Top-k documents for a question, scored by their best chunk.

    Returns [{id, kind, title, score, chunk: {heading, text}}] where
    `chunk` is the best-matching body chunk (None if the summary won).
    """
    if _store is None:
        await warmup()
    # bge models want a query prefix; fastembed's query_embed adds it
    qvec = await asyncio.to_thread(
        lambda: np.asarray(next(iter(_model.query_embed(question))), dtype=np.float32)
    )
    out = []
    for hit in await _store.search(qvec, k):
        doc = by_id(hit.doc_id)
        if doc is None:  # index ahead of corpus.json (shouldn't happen after sync)
            continue
        out.append(
            {
                "id": doc["id"],
                "kind": doc["kind"],
                "title": doc["title"],
                "score": hit.score,
                "chunk": None if hit.is_summary else {"heading": hit.heading, "text": hit.text},
            }
        )
    return out
