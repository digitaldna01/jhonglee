"""Semantic retrieval over the portfolio corpus — the "R" in RAG.

Chunk-level retrieval with template-generated contextual embeddings
(see ingest.passage_text). A document's score is the max over its
chunks; the best chunk rides along for the answer context.

Embeddings come from fastembed (ONNX, no torch — Raspberry-Pi friendly;
model selection and custom registrations in embedding.py); vectors live in the store selected by DATABASE_URL (pgvector in
production, numpy in-process otherwise — see store.py). `warmup()` loads
the model, syncs the index incrementally and derives the graph edges.
"""
from __future__ import annotations

import asyncio
import logging

import numpy as np

from ..content.repository import NODES, by_id
from ..core.config import get_settings
from . import embedding, ingest
from .store import Hit, VectorStore, select_store

log = logging.getLogger(__name__)

# Each graph node links to its top-MAX most similar peers. Real-embedding
# cosines cluster high, so raw scores are rescaled into the weight band
# the force layout was tuned for.
_EDGE_MAX_PER_NODE = 2

_CANDIDATES = 20  # docs pulled per ranking before fusion (corpus is small)
RRF_K = 60  # reciprocal-rank-fusion constant (standard value)
CONTEXT_WEIGHT = 0.6  # the contextual ranking counts less than the question itself

_model = None
_store: VectorStore | None = None
_edges: list[dict] | None = None


def _embed_passages(texts: list[str]) -> np.ndarray:
    return embedding.embed_passages(_model, texts)


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
        _model = await asyncio.to_thread(embedding.load, settings.embed_model)
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


def rrf(rankings: list[list[str]], weights: list[float] | None = None, k: int = RRF_K) -> list[str]:
    """(Weighted) reciprocal rank fusion: ids ordered by Σ w / (k + rank)."""
    weights = weights or [1.0] * len(rankings)
    score: dict[str, float] = {}
    for ranking, w in zip(rankings, weights):
        for rank, doc_id in enumerate(ranking, start=1):
            score[doc_id] = score.get(doc_id, 0.0) + w / (k + rank)
    return sorted(score, key=score.get, reverse=True)


def contextual_query(question: str, context_title: str) -> str:
    """A follow-up anchored to what the conversation was just about — the
    title of the previous turn's top source. One title is enough to pull an
    elliptical question ("how did you initialise them?") back to its topic,
    and light enough that a real topic switch still wins (golden set
    2026-08-29: A 1/7→4/7 at r@1, B and D unchanged; prev-question text
    instead of the title dragged topic switches back)."""
    return f"{question} {context_title}"


async def _rank(text: str) -> list[Hit]:
    qvec = await asyncio.to_thread(embedding.embed_query, _model, text)
    return await _store.search(qvec, _CANDIDATES)


async def retrieve(question: str, k: int = 4, *, context_title: str | None = None) -> list[dict]:
    """Top-k documents for a question, scored by their best chunk.

    In a conversation, pass the title of the previous turn's top source as
    `context_title`: a second ranking is made for the contextual query and
    fused with the question-only ranking (weighted RRF), so elliptical
    follow-ups recover their topic while a topic switch is not dragged back.

    Returns [{id, kind, title, score, chunk: {heading, text}}] — `score`
    is the best cosine seen for the doc, `chunk` its best body chunk
    (None if the summary won).
    """
    if _store is None:
        await warmup()
    rankings = [await _rank(question)]
    weights = [1.0]
    if context_title:
        rankings.append(await _rank(contextual_query(question, context_title)))
        weights.append(CONTEXT_WEIGHT)

    best: dict[str, Hit] = {}
    for hits in rankings:
        for h in hits:
            if h.doc_id not in best or h.score > best[h.doc_id].score:
                best[h.doc_id] = h
    order = rrf([[h.doc_id for h in hits] for hits in rankings], weights)

    out = []
    for doc_id in order[:k]:
        doc, hit = by_id(doc_id), best[doc_id]
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
