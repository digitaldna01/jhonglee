"""Portfolio RAG chat — /api/chat/*.

GET  /api/chat/graph   nodes + similarity edges for the landing map
POST /api/chat/stream  SSE: `sources` (retrieval result + timing) →
                       `delta` (answer text chunks) → `done` (model label)

Generation uses the Anthropic API when ANTHROPIC_API_KEY is set and falls
back to an extractive answer composed from the retrieved documents when it
is not (or when the API call fails) — the stream shape is identical either
way, so the frontend never special-cases.
"""
from __future__ import annotations

import json
import time
from collections.abc import Iterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..core.config import get_settings
from ..data.corpus import BIO, NODES, by_id
from ..ml import retrieval
from ..schemas.chat import ChatRequest, GraphResponse

router = APIRouter(prefix="/chat", tags=["chat"])

HISTORY_MAX = 8  # prior turns carried into a follow-up question

SYSTEM_PROMPT = (
    "You are the assistant on Jae Hong Lee's portfolio site. Answer the visitor's "
    'question in 2-3 short sentences, in first person as Jae ("I…"). Ground your '
    "answer ONLY in the context provided with the question; if something isn't "
    "covered, say you're not sure and point to what is here. Refer to any project "
    "by its exact title. Be plain and specific — no marketing language, no lists. "
    "This may be a follow-up in an ongoing conversation, so use the prior turns "
    "for context. Answer in the language the question was asked in."
)


@router.get("/graph", response_model=GraphResponse)
def graph():
    """Everything the landing map needs, from the corpus's single source."""
    settings = get_settings()
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
            for d in NODES
        ],
        "edges": retrieval.edges(),
        "retrieval_model": settings.embed_model.split("/")[-1] + ", server",
    }


_EXCERPT_MAX = 1200  # chars of body chunk quoted into the model context


def _build_context(retrieved: list[dict]) -> str:
    """Summary per doc, plus the best-matching body excerpt when one won."""
    lines = []
    for r in retrieved:
        d = by_id(r["id"])
        if d is None:
            continue
        if d["kind"] == "bio":
            lines.append(f"About Jae Hong Lee: {d['summary']}")
        else:
            label = "Project" if d["kind"] in ("project", "post") else d["kind"].capitalize()
            tags = ", ".join(d["tags"])
            meta = ", ".join(x for x in (d["year"], tags) if x)
            lines.append(f"{label} — {d['title']} ({meta}): {d['summary']}")
        chunk = r.get("chunk")
        if chunk:
            head = f" ({chunk['heading']})" if chunk.get("heading") else ""
            lines.append(f'Excerpt from "{d["title"]}"{head}: {chunk["text"][:_EXCERPT_MAX]}')
    return "\n".join(lines)


def _extractive_answer(retrieved: list[dict]) -> str:
    """Answer composed from the sources alone — used when no model is available."""
    projects = [r for r in retrieved if r["kind"] != "bio"]
    bio_hit = next((r for r in retrieved if r["kind"] == "bio"), None)
    if bio_hit and (not projects or bio_hit["score"] >= projects[0]["score"]):
        return BIO["summary"]
    if not projects:
        return (
            "I'm not sure that's covered here — try asking about my machine-learning, "
            "typography, or interface work."
        )
    top = by_id(projects[0]["id"])
    also = [r["title"] for r in projects[1:]]
    return f"Closest in my work is {top['title']} — {top['summary']}" + (
        f" Related: {', '.join(also)}." if also else ""
    )


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _generate(req: ChatRequest) -> Iterator[str]:
    settings = get_settings()

    t0 = time.perf_counter()
    retrieved = retrieval.retrieve(req.question, k=4)
    retrieval_ms = (time.perf_counter() - t0) * 1000

    yield _sse(
        "sources",
        {
            "sources": [
                {"id": r["id"], "kind": r["kind"], "title": r["title"], "score": round(r["score"], 3)}
                for r in retrieved
            ],
            "retrieval_ms": round(retrieval_ms, 1),
            "retrieval_model": settings.embed_model.split("/")[-1] + ", server",
        },
    )

    if not settings.anthropic_api_key:
        yield _sse("delta", {"text": _extractive_answer(retrieved)})
        yield _sse("done", {"model": "retrieval-only (no model configured)"})
        return

    # the bio is tiny — always give the model who-am-I grounding, even
    # when the question retrieved only project documents
    ctx_docs = list(retrieved)
    if not any(r["kind"] == "bio" for r in ctx_docs):
        ctx_docs.append({"id": BIO["id"], "kind": "bio", "title": BIO["title"], "score": 0.0})
    context = _build_context(ctx_docs)
    history = [t.model_dump() for t in req.history[-HISTORY_MAX:]]
    messages = history + [
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {req.question}"}
    ]

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        with client.messages.stream(
            model=settings.chat_model,
            max_tokens=300,
            system=SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield _sse("delta", {"text": text})
        yield _sse("done", {"model": settings.chat_model})
    except Exception:
        # graceful degrade: same stream shape, extractive answer
        yield _sse("delta", {"text": _extractive_answer(retrieved)})
        yield _sse("done", {"model": "retrieval-only (model unavailable)"})


@router.post("/stream")
def stream(req: ChatRequest):
    return StreamingResponse(
        _generate(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # keep nginx from buffering the stream
        },
    )
