"""RAG chat orchestration: retrieve → context → generate.

Yields domain events as (name, payload) tuples; the router turns them
into SSE. Keeping the transport out means the same generator can be
driven by tests or a future websocket without change.
"""
from __future__ import annotations

import time
from collections.abc import AsyncIterator

from ..content import service as content
from ..core.config import get_settings
from . import chatlog, generation, history, retrieval

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


async def answer(
    question: str,
    client_history: list[dict],
    *,
    visitor_id: str | None = None,
    session_id: str | None = None,
) -> AsyncIterator[tuple[str, dict]]:
    """sources → delta* → done. With a session, the server-side transcript
    wins over whatever the client sent; afterwards the exchange is appended
    to the session and logged."""
    turns = client_history[-history.HISTORY_MAX * 2 :]
    context_title: str | None = None
    if visitor_id and session_id:  # (not a bool flag: keeps the Optional narrowing for the type checker)
        session = await history.load_session(visitor_id, session_id)
        turns = session["turns"] or turns
        if session["last_sources"]:
            prev_top = content.get_any(session["last_sources"][0])
            context_title = prev_top["title"] if prev_top else None

    t0 = time.perf_counter()
    retrieved = await retrieval.retrieve(question, k=TOP_K, context_title=context_title)
    retrieval_ms = round((time.perf_counter() - t0) * 1000, 1)

    sources = [
        {"id": r["id"], "kind": r["kind"], "title": r["title"], "score": round(r["score"], 3)}
        for r in retrieved
    ]
    yield "sources", {
        "sources": sources,
        "retrieval_ms": retrieval_ms,
        "retrieval_model": retrieval_label(),
    }

    parts: list[str] = []
    model = ""
    usage: dict = {}
    async for name, payload in generation.generate(question, retrieved, turns, topic=context_title):
        if name == "delta":
            parts.append(payload["text"])
        elif name == "done":
            model = payload["model"]
            usage = {k: payload.get(k) for k in ("input_tokens", "output_tokens")}
        yield name, payload

    answer_text = "".join(parts)
    if visitor_id and session_id:
        await history.append(
            visitor_id, session_id, question, answer_text, sources=[s["id"] for s in sources]
        )
    if visitor_id:
        await chatlog.record(
            visitor_id=visitor_id,
            session_id=session_id,
            question=question,
            sources=sources,
            answer=answer_text,
            model=model,
            retrieval_ms=retrieval_ms,
            **usage,
        )
