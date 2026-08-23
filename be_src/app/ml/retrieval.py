"""Semantic retrieval over the portfolio corpus — the "R" in RAG.

Embeds every corpus document once at first use (fastembed / ONNX — no
torch, Raspberry-Pi friendly) and answers nearest-neighbour queries with
real cosine similarity. Also derives the similarity edges the landing
graph draws between projects.

Swapping the embedding model is a config change (EMBED_MODEL); the
Docker image pre-downloads it at build time so the Pi never needs to
pull model weights at runtime.
"""
from __future__ import annotations

import threading

import numpy as np

from ..core.config import get_settings
from ..data.corpus import KNOWLEDGE, PROJECTS

# Each project links to its top-MAX most similar peers. Real-embedding
# cosines cluster high, so raw scores are rescaled to spread [0, 1]-ish
# weights for the graph's spring lengths / line widths.
_EDGE_MAX_PER_NODE = 2

_lock = threading.Lock()
_state: dict | None = None  # {model, doc_vecs: {id: vec}, edges: [...]}


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b)) or 1.0
    return float(np.dot(a, b)) / denom


def _passage_text(doc: dict) -> str:
    if doc["kind"] == "bio":
        # question-shaped surface so "who are you?"-style queries land here
        return f"Who are you? Who is Jae Hong Lee? About me: {doc['desc']} {doc['blurb']}"
    return f"{doc['title']} ({', '.join(doc['tags'])}): {doc['desc']} {doc['blurb']}"


def _build_edges(doc_vecs: dict[str, np.ndarray]) -> list[dict]:
    raw: dict[tuple[int, int], float] = {}
    for ai, a in enumerate(PROJECTS):
        sims = sorted(
            (
                (bi, _cosine(doc_vecs[a["id"]], doc_vecs[b["id"]]))
                for bi, b in enumerate(PROJECTS)
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
            "a": PROJECTS[ai]["id"],
            "b": PROJECTS[bi]["id"],
            # keep weights in the band the force layout was tuned for
            "w": round(0.15 + 0.7 * ((s - lo) / span), 3),
        }
        for (ai, bi), s in sorted(raw.items())
    ]


def _ensure_ready() -> dict:
    global _state
    if _state is not None:
        return _state
    with _lock:
        if _state is not None:
            return _state
        from fastembed import TextEmbedding

        settings = get_settings()
        model = TextEmbedding(settings.embed_model)
        docs = list(KNOWLEDGE)
        vecs = list(model.passage_embed([_passage_text(d) for d in docs]))
        doc_vecs = {d["id"]: np.asarray(v) for d, v in zip(docs, vecs)}
        _state = {
            "model": model,
            "doc_vecs": doc_vecs,
            "edges": _build_edges(doc_vecs),
        }
        return _state


def warmup() -> None:
    """Load the model and embed the corpus (called at app startup)."""
    _ensure_ready()


def edges() -> list[dict]:
    return _ensure_ready()["edges"]


def retrieve(question: str, k: int = 4) -> list[dict]:
    """Top-k corpus documents for a question: [{id, kind, title, score}]."""
    state = _ensure_ready()
    qvec = np.asarray(next(iter(state["model"].query_embed(question))))
    scored = [
        {
            "id": d["id"],
            "kind": d["kind"],
            "title": d["title"],
            "score": _cosine(qvec, state["doc_vecs"][d["id"]]),
        }
        for d in KNOWLEDGE
    ]
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:k]
