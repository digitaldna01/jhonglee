"""Semantic retrieval over the portfolio corpus — the "R" in RAG.

Chunk-level retrieval with contextual embedding (Anthropic-style, but
template-generated — the frontmatter is rich enough that no LLM is
needed to write the chunk context):

  passage = "From {title} ({kind}; {tags}): {chunk text}"

Every doc also gets a synthetic summary chunk, so a doc is findable
even when its body is thin. A document's score is the max over its
chunks; the best chunk rides along for the answer context.

Embeddings come from fastembed (ONNX, no torch — Raspberry-Pi
friendly); the Docker image pre-downloads the model at build time.
"""
from __future__ import annotations

import threading

import numpy as np

from ..core.config import get_settings
from ..data.corpus import KNOWLEDGE, NODES

# Each graph node links to its top-MAX most similar peers. Real-embedding
# cosines cluster high, so raw scores are rescaled into the weight band
# the force layout was tuned for.
_EDGE_MAX_PER_NODE = 2

_lock = threading.Lock()
_state: dict | None = None  # {model, chunks, chunk_vecs, doc_vecs, edges}


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b)) or 1.0
    return float(np.dot(a, b)) / denom


def _passage_text(doc: dict, text: str) -> str:
    if doc["kind"] == "bio":
        # question-shaped surface so "who are you?"-style queries land here
        return f"Who are you? Who is Jae Hong Lee? About me: {text}"
    tags = ", ".join(doc["tags"])
    return f"From {doc['title']} ({doc['kind']}; {tags}): {text}"


def _doc_chunks(doc: dict) -> list[dict]:
    """Body chunks plus a synthetic summary chunk."""
    summary = {"id": f"{doc['id']}#summary", "heading": None, "text": doc["summary"]}
    return [summary, *doc["chunks"]]


def _build_edges(doc_vecs: dict[str, np.ndarray]) -> list[dict]:
    raw: dict[tuple[int, int], float] = {}
    for ai, a in enumerate(NODES):
        sims = sorted(
            (
                (bi, _cosine(doc_vecs[a["id"]], doc_vecs[b["id"]]))
                for bi, b in enumerate(NODES)
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
            "a": NODES[ai]["id"],
            "b": NODES[bi]["id"],
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

        chunks: list[tuple[dict, dict]] = [  # (doc, chunk)
            (doc, chunk) for doc in KNOWLEDGE for chunk in _doc_chunks(doc)
        ]
        passages = [_passage_text(doc, chunk["text"]) for doc, chunk in chunks]
        chunk_vecs = np.stack([np.asarray(v) for v in model.passage_embed(passages)])

        # doc-level vectors (for graph edges): the summary chunk's vector
        doc_vecs = {
            doc["id"]: chunk_vecs[i]
            for i, (doc, chunk) in enumerate(chunks)
            if chunk["id"].endswith("#summary")
        }

        _state = {
            "model": model,
            "chunks": chunks,
            "chunk_vecs": chunk_vecs,
            "edges": _build_edges(doc_vecs),
        }
        return _state


def warmup() -> None:
    """Load the model and embed the corpus (called at app startup)."""
    _ensure_ready()


def edges() -> list[dict]:
    return _ensure_ready()["edges"]


def retrieve(question: str, k: int = 4) -> list[dict]:
    """Top-k documents for a question, scored by their best chunk.

    Returns [{id, kind, title, score, chunk: {id, heading, text}}] where
    `chunk` is the best-matching body chunk (None if the summary won).
    """
    state = _ensure_ready()
    qvec = np.asarray(next(iter(state["model"].query_embed(question))))

    norms = np.linalg.norm(state["chunk_vecs"], axis=1) * (np.linalg.norm(qvec) or 1.0)
    scores = state["chunk_vecs"] @ qvec / np.where(norms == 0, 1.0, norms)

    best: dict[str, dict] = {}
    for (doc, chunk), s in zip(state["chunks"], scores):
        cur = best.get(doc["id"])
        if cur is None or s > cur["score"]:
            is_summary = chunk["id"].endswith("#summary")
            best[doc["id"]] = {
                "id": doc["id"],
                "kind": doc["kind"],
                "title": doc["title"],
                "score": float(s),
                "chunk": None if is_summary else chunk,
            }
    return sorted(best.values(), key=lambda x: x["score"], reverse=True)[:k]
