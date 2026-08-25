"""RAG chat orchestration: retrieve → context → generate.

Yields domain events as (name, payload) tuples; the router turns them
into SSE. Keeping the transport out means the same generator can be
driven by tests or a future websocket without change.
"""
from __future__ import annotations

import time
from collections.abc import Iterator

from ..content import service as content
from ..core.config import get_settings
from . import generation, retrieval

HISTORY_MAX = 8  # prior turns carried into a follow-up question
TOP_K = 4


def retrieval_label() -> str:
    return get_settings().embed_model.split("/")[-1] + ", server"


def graph() -> dict:
    """Everything the landing map needs, from the corpus's single source."""
    return {
        "projects": [
            {
                "id": d["id"],
                "title": d["title"],
                "year": d["year"] or "",
                "lean": d["lean"] or d["kind"],
                "tags": d["tags"],
                "stack": d["stack"] or "",
                "desc": d["summary"],
                "url": d["url"] or "#",
            }
            for d in content.nodes()
        ],
        "edges": retrieval.edges(),
        "retrieval_model": retrieval_label(),
    }


def answer(question: str, history: list[dict]) -> Iterator[tuple[str, dict]]:
    t0 = time.perf_counter()
    retrieved = retrieval.retrieve(question, k=TOP_K)
    retrieval_ms = (time.perf_counter() - t0) * 1000

    yield "sources", {
        "sources": [
            {"id": r["id"], "kind": r["kind"], "title": r["title"], "score": round(r["score"], 3)}
            for r in retrieved
        ],
        "retrieval_ms": round(retrieval_ms, 1),
        "retrieval_model": retrieval_label(),
    }

    gen = generation.generate(question, retrieved, history[-HISTORY_MAX:])
    while True:
        try:
            chunk = next(gen)
        except StopIteration as done:
            yield "done", {"model": done.value}
            return
        yield "delta", {"text": chunk}
