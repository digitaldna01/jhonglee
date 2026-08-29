"""Prompt text and context assembly for the RAG chat.

Kept apart from the transport (router) and the model call (generation)
so tone changes are a copy edit, not a code change.
"""
from __future__ import annotations

import re

from ..content.repository import BIO, by_id

_HANGUL = re.compile(r"[가-힣]")

SYSTEM_PROMPT = (
    "You are the assistant on Jae Hong Lee's portfolio site, answering in first person as Jae (\"I…\"). "
    "Each question comes with <documents> from the site, most relevant first. "
    "Answer in 2-3 short sentences. Ground every statement ONLY in those documents; "
    "never invent facts, opinions, feelings or preferences for Jae. "
    "If something isn't covered, say it isn't covered here — don't confirm or deny it — and point to what is. "
    "Refer to any project by its exact title. Plain text only: no markdown, no bullet lists, no headings. "
    "Be plain and specific — no marketing language. "
    "This may be a follow-up in an ongoing conversation; when the question says \"it\" or \"that\", "
    "it means the topic named after the question, not another document. "
    "Answer in the language of the latest question, even if earlier turns were in another language. "
    "In Korean, use polite 해요체 consistently."
)

EXCERPT_MAX = 1200  # chars of body chunk quoted into the model context


def _attr(text: str) -> str:
    return text.replace('"', "'")


def build_context(retrieved: list[dict]) -> str:
    """The retrieved docs as numbered <document> tags (Anthropic's recommended
    shape for grounding), most relevant first: summary per doc, plus the
    best-matching body excerpt when one won.

    The bio is tiny, so it is always appended — who-am-I grounding even
    when the question retrieved only project documents.
    """
    docs = list(retrieved)
    if not any(r["kind"] == "bio" for r in docs):
        docs.append({"id": BIO["id"], "kind": "bio", "title": BIO["title"], "score": 0.0})

    parts = ["<documents>"]
    for i, r in enumerate(docs, start=1):
        d = by_id(r["id"])
        if d is None:
            continue
        if d["kind"] == "bio":
            parts.append(f'<document index="{i}" type="about Jae Hong Lee">\n{d["summary"]}\n</document>')
            continue
        kind = "project" if d["kind"] in ("project", "post") else d["kind"]
        body = d["summary"]
        chunk = r.get("chunk")
        if chunk:
            head = f' heading="{_attr(chunk["heading"])}"' if chunk.get("heading") else ""
            body += f"\n<excerpt{head}>\n{chunk['text'][:EXCERPT_MAX]}\n</excerpt>"
        meta = f' year="{d["year"]}"' if d.get("year") else ""
        tags = f' tags="{_attr(", ".join(d["tags"]))}"' if d.get("tags") else ""
        parts.append(f'<document index="{i}" title="{_attr(d["title"])}" type="{kind}"{meta}{tags}>\n{body}\n</document>')
    parts.append("</documents>")
    return "\n".join(parts)


def answer_language(question: str) -> str:
    """The language to answer in, decided here rather than left to the model:
    after a few Korean turns the model kept answering an English follow-up
    in Korean despite the system prompt, so the user turn says it explicitly."""
    return "Korean" if _HANGUL.search(question) else "English"


def user_message(question: str, context: str, *, topic: str | None = None) -> str:
    """Documents first, question last (Anthropic long-context guidance), then
    two facts the server knows better than the model: what the previous turn
    was about (so "tell me more about it" cannot drift to a richer excerpt
    of another project — 1 in 3 did) and which language to answer in."""
    lines = [context, "", f"Question: {question}"]
    if topic:
        lines.append(f'(This is a follow-up; the previous answer was about "{topic}".)')
    lines.append(f"(Answer in {answer_language(question)}.)")
    return "\n".join(lines)
