"""Answer generation: Anthropic streaming, with an extractive fallback.

`generate()` yields text chunks and finally returns the model label via
StopIteration value — callers use `yield from`. The stream shape is the
same whether a model is configured or not, so nothing upstream branches.
"""
from __future__ import annotations

from collections.abc import Iterator

from ..core.config import get_settings
from ..content.repository import BIO, by_id
from .prompts import SYSTEM_PROMPT, build_context, user_message

MAX_TOKENS = 300  # 2-3 sentences — a spec, not a rate limit


def extractive_answer(retrieved: list[dict]) -> str:
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


def generate(question: str, retrieved: list[dict], history: list[dict]) -> Iterator[str]:
    """Yield answer text chunks; return the model label when done."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        yield extractive_answer(retrieved)
        return "retrieval-only (no model configured)"

    messages = history + [
        {"role": "user", "content": user_message(question, build_context(retrieved))}
    ]
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        with client.messages.stream(
            model=settings.chat_model,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            yield from stream.text_stream
        return settings.chat_model
    except Exception:
        # graceful degrade: same stream shape, extractive answer
        yield extractive_answer(retrieved)
        return "retrieval-only (model unavailable)"
