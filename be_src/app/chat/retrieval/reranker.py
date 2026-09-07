"""Cross-encoder reranking — the last word on document order.

The bi-encoder (embedding) ranking scores question and passage separately
and meets them at a cosine; a cross-encoder reads the pair together, which
resolves exactly the confusions the golden set and the production logs kept
showing: "font or typography work" ranked Visual Art Portfolio over Gill
Sans, "initialise the centroids" quoted the intro over "Four ways to start".
Measured on the corpus (2026-09-07, ms-marco-MiniLM-L-6-v2 int8): all three
recorded failures land their target at rank 1.

The model is English-only, and that is enough on purpose: the query rewrite
(rewrite.py) turns Korean questions into English before retrieval. When the
query still contains Hangul (the rewriter failed and the original question
fell through), reranking is skipped rather than fed noise.

Cost, measured on the Pi 4: +234 MB RSS for the ONNX session, ~16 s one-time
load at startup, and ~80 ms per scored pair — CANDIDATES bounds the spend
per question. Dev (M-series) scores the same pairs at ~5 ms each.

Import-light on purpose (stdlib at module level, fastembed inside load) so
the Dockerfile can run this file standalone to bake the model into the image,
the way it does app/chat/embedding.py.
"""
from __future__ import annotations

import re

CANDIDATES = 10  # pairs scored per question
PASSAGE_MAX = 320  # chars of a passage the encoder reads. Attention cost grows
# ~quadratically with length: on the Pi, 10 realistic pairs took 14s uncapped,
# 0.86s at 320 (golden set identical — the title, heading and opening sentences
# carry the topic, and post-writing-guide puts the answer in the first sentence).
GATE = 0.0  # only pairs the cross-encoder scores at least this high may be promoted
# (ms-marco logits on this corpus: clearly relevant pairs land at +3..+7, clearly
# unrelated at -5..-9. Meta questions — "Who are you?", "무슨 일 해?" — score every
# passage low; the gate keeps the hybrid order standing there instead of letting
# noise reorder it: ungated, EN r@1 fell 12/12 → 7/12 on the golden set.)

_HANGUL = re.compile(r"[가-힣]")


def load(model_name: str):
    """The fastembed cross-encoder (deferred import: the session is ~230 MB)."""
    from fastembed.rerank.cross_encoder import TextCrossEncoder

    return TextCrossEncoder(model_name)


def applies(question: str) -> bool:
    """ms-marco MiniLM reads English only; a Hangul query would score noise."""
    return not _HANGUL.search(question)


def passage(title: str, heading: str | None, text: str) -> str:
    """What the cross-encoder reads for one candidate: the chunk, located,
    capped at PASSAGE_MAX chars (see above — latency, not quality)."""
    return f"{title} / {heading or 'introduction'}: {text}"[:PASSAGE_MAX]


def scores(encoder, question: str, passages: list[str]) -> list[float]:
    """One relevance logit per passage. Sync — call via asyncio.to_thread."""
    return list(encoder.rerank(question, passages))


def order(scored: list[float], gate: float = GATE) -> list[int]:
    """Indices of the scored passages: gate-passers first, by score; the rest
    keep their incoming (hybrid) order. With no passer this is the identity."""
    passed = sorted((i for i, s in enumerate(scored) if s >= gate), key=lambda i: -scored[i])
    return passed + [i for i, s in enumerate(scored) if s < gate]


if __name__ == "__main__":  # Dockerfile: pre-download the model into the image
    import sys

    load(sys.argv[1] if len(sys.argv) > 1 else "Xenova/ms-marco-MiniLM-L-6-v2")
    print("reranker model cached")
