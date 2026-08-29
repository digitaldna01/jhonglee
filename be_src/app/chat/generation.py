"""Answer generation: Anthropic streaming, with an extractive fallback.

`generate()` is an async generator of (event, payload) pairs — `delta`
chunks then one `done` with the model label. The stream shape is the
same whether a model is configured or not, so nothing upstream branches.
"""
from __future__ import annotations

import logging

from collections.abc import AsyncIterator
from typing import Any

from ..core.config import get_settings
from ..content.repository import BIO, by_id
from .prompts import SYSTEM_PROMPT, build_context, user_message

log = logging.getLogger(__name__)

MAX_TOKENS = 300  # 2-3 sentences — a spec, not a rate limit

Event = tuple[str, dict]


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
    top = by_id(projects[0]["id"])  # None only if the index is ahead of corpus.json
    summary = f" — {top['summary']}" if top else ""
    also = [r["title"] for r in projects[1:]]
    return f"Closest in my work is {projects[0]['title']}{summary}" + (
        f" Related: {', '.join(also)}." if also else ""
    )


async def generate(
    question: str, retrieved: list[dict], history: list[dict], *, topic: str | None = None
) -> AsyncIterator[Event]:
    """Yield ("delta", {text}) chunks, then ("done", {model, input_tokens?, output_tokens?}) —
    the token usage is present only when a model actually answered."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        yield "delta", {"text": extractive_answer(retrieved)}
        yield "done", {"model": "retrieval-only (no model configured)"}
        return

    messages: list[Any] = history + [  # MessageParam-shaped dicts; the SDK validates
        {"role": "user", "content": user_message(question, build_context(retrieved), topic=topic)}
    ]
    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        async with client.messages.stream(
            model=settings.chat_model,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield "delta", {"text": text}
            usage = (await stream.get_final_message()).usage
        yield "done", {
            "model": settings.chat_model,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
        }
    except Exception as e:  # noqa: BLE001 — the answer must still stream
        # graceful degrade: same stream shape, extractive answer. Say why in the
        # log: a wrong key (401), an empty credit balance (400), a retired
        # model id (404) all look identical to the client otherwise.
        log.warning("generation via %s failed, extractive fallback: %s: %s",
                    settings.chat_model, type(e).__name__, str(e)[:300])
        yield "delta", {"text": extractive_answer(retrieved)}
        yield "done", {"model": "retrieval-only (model unavailable)"}
