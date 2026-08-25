"""Prompt text and context assembly for the RAG chat.

Kept apart from the transport (router) and the model call (generation)
so tone changes are a copy edit, not a code change.
"""
from __future__ import annotations

from ..content.repository import BIO, by_id

SYSTEM_PROMPT = (
    "You are the assistant on Jae Hong Lee's portfolio site. Answer the visitor's "
    'question in 2-3 short sentences, in first person as Jae ("I…"). Ground your '
    "answer ONLY in the context provided with the question; if something isn't "
    "covered, say you're not sure and point to what is here. Refer to any project "
    "by its exact title. Be plain and specific — no marketing language, no lists. "
    "This may be a follow-up in an ongoing conversation, so use the prior turns "
    "for context. Answer in the language the question was asked in."
)

EXCERPT_MAX = 1200  # chars of body chunk quoted into the model context


def build_context(retrieved: list[dict]) -> str:
    """Summary per doc, plus the best-matching body excerpt when one won.

    The bio is tiny, so it is always appended — who-am-I grounding even
    when the question retrieved only project documents.
    """
    docs = list(retrieved)
    if not any(r["kind"] == "bio" for r in docs):
        docs.append({"id": BIO["id"], "kind": "bio", "title": BIO["title"], "score": 0.0})

    lines = []
    for r in docs:
        d = by_id(r["id"])
        if d is None:
            continue
        if d["kind"] == "bio":
            lines.append(f"About Jae Hong Lee: {d['summary']}")
        else:
            label = "Project" if d["kind"] in ("project", "post") else d["kind"].capitalize()
            meta = ", ".join(x for x in (d["year"], ", ".join(d["tags"])) if x)
            lines.append(f"{label} — {d['title']} ({meta}): {d['summary']}")
        chunk = r.get("chunk")
        if chunk:
            head = f" ({chunk['heading']})" if chunk.get("heading") else ""
            lines.append(f'Excerpt from "{d["title"]}"{head}: {chunk["text"][:EXCERPT_MAX]}')
    return "\n".join(lines)


def user_message(question: str, context: str) -> str:
    return f"Context:\n{context}\n\nQuestion: {question}"
