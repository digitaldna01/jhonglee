"""Hybrid ranking: dense + keyword (+ follow-up anchor), fused by score.

Three rankings of the corpus, each a list of documents by their best chunk:

  dense(question)            cosine over the chunk embeddings   weight 1.0
  keyword(question)          ts_rank_cd / BM25 exact tokens     KEYWORD_WEIGHT
  dense(question + title)    only in a conversation: the title  CONTEXT_WEIGHT
                             of the previous turn's top source

fused as a weighted sum — raw cosines for the dense rankings, the keyword
score normalised by the query's best hit (FUSION="score"; weighted RRF is
kept as the alternative). With a nine-document corpus every dense ranking
contains every document, so RRF flattens to 1/61 vs 1/66 and mere
*membership* in the keyword list decides; the score sum keeps the size of
a cosine gap (0.64 vs 0.27 for an anchored follow-up) and won every golden
set column. Dense carries paraphrase and Korean; keyword carries names the
multilingual model tokenises badly (k-means → k/-/me/ans, XGBoost, Blender).

The keyword ranking is *gated* by dense: it may only promote documents
whose cosine for the question is within KEYWORD_GATE of the best, so a
lone token hit ("living" ↔ "live demo") cannot outrank the embedding's
clear favourite; gated, keyword acts as lexical precision over dense
recall — the reranker role. The gate looks at the question-only cosines: the
anchored query inflates the previous topic's score (its title is in the
text), which must not shut the door on a real topic switch. The constants
are what the golden set picked (scripts/eval_retrieval.py) — re-measure
before changing them.

Pure over a `VectorStore` + an embed function, so the evaluation script
ranks exactly like production.
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from ..store import Hit, VectorStore

CANDIDATES = 20  # docs pulled per ranking before fusion (corpus is small)
RRF_K = 60  # reciprocal-rank-fusion constant (standard value)
FUSION = "score"  # "score": weighted sum of cosines (+ normalised keyword score) | "rrf"
KEYWORD_WEIGHT = 0.1  # keyword ranking vs the dense ranking (score: a cosine-sized bonus; rrf: ~0.5)
KEYWORD_GATE = 0.6  # keyword hits count only for docs with cosine ≥ GATE × best cosine
CONTEXT_WEIGHT = 0.3  # the contextual ranking counts less than the question itself (rrf: 0.6)

EmbedQuery = Callable[[str], np.ndarray]


@dataclass(frozen=True)
class Ranked:
    doc_id: str
    score: float  # best dense cosine for the doc — what the client displays
    hit: Hit  # the chunk to quote: from the ranking that placed the doc highest


def rrf(rankings: list[list[str]], weights: list[float] | None = None, k: int = RRF_K) -> list[str]:
    """(Weighted) reciprocal rank fusion: ids ordered by Σ w / (k + rank)."""
    weights = weights or [1.0] * len(rankings)
    score: dict[str, float] = {}
    for ranking, w in zip(rankings, weights):
        for rank, doc_id in enumerate(ranking, start=1):
            score[doc_id] = score.get(doc_id, 0.0) + w / (k + rank)
    return sorted(score, key=lambda d: score[d], reverse=True)


def contextual_query(question: str, context_title: str) -> str:
    """A follow-up anchored to what the conversation was just about — the
    title of the previous turn's top source. One title is enough to pull an
    elliptical question ("how did you initialise them?") back to its topic,
    and light enough that a real topic switch still wins (golden set
    2026-08-29: A 1/7→4/7 at r@1, B and D unchanged; prev-question text
    instead of the title dragged topic switches back)."""
    return f"{question} {context_title}"


async def rank(
    store: VectorStore,
    embed_query: EmbedQuery,
    question: str,
    *,
    context_title: str | None = None,
    keyword_weight: float = KEYWORD_WEIGHT,
    keyword_gate: float = KEYWORD_GATE,
    context_weight: float = CONTEXT_WEIGHT,
    context_keyword: bool = False,
    fusion: str = FUSION,
    candidates: int = CANDIDATES,
) -> list[Ranked]:
    """Every candidate document, best first.

    fusion="score": Σ w · score, dense scores being raw cosines (comparable
    across queries for one model) and the keyword score normalised by the
    query's best hit (0..1). fusion="rrf": weighted reciprocal rank fusion.
    `context_keyword` adds a keyword ranking of the contextual query too
    (measured worse: the title's own words over-anchor topic switches) —
    kept as an evaluation knob."""

    async def dense(text: str) -> list[Hit]:
        qvec = await asyncio.to_thread(embed_query, text)
        return await store.search(qvec, candidates)

    # (hits, weight, is_dense)
    rankings: list[tuple[list[Hit], float, bool]] = [(await dense(question), 1.0, True)]
    queries = [question]
    if context_title:
        queries.append(contextual_query(question, context_title))
        rankings.append((await dense(queries[-1]), context_weight, True))

    plain = {h.doc_id: h.score for h in rankings[0][0]}  # question-only cosines
    floor = keyword_gate * max(plain.values(), default=0.0)
    if keyword_weight > 0:
        for q in queries if context_keyword else queries[:1]:
            hits = [h for h in await store.keyword_search(q, candidates) if plain.get(h.doc_id, -1.0) >= floor]
            rankings.append((hits, keyword_weight, False))

    score: dict[str, float] = {}  # best dense cosine per doc
    for hits, _, is_dense in rankings:
        for h in hits:
            if is_dense:
                score[h.doc_id] = max(score.get(h.doc_id, -1.0), h.score)

    # the chunk to quote: from the ranking that placed the doc highest; on a
    # tie the keyword hit wins (it holds the exact term the question used)
    quote: dict[str, tuple[tuple[int, bool], Hit]] = {}
    for hits, _, is_dense in rankings:
        for pos, h in enumerate(hits):
            if h.doc_id not in quote or (pos, is_dense) < quote[h.doc_id][0]:
                quote[h.doc_id] = ((pos, is_dense), h)

    if fusion == "rrf":
        order = rrf([[h.doc_id for h in hits] for hits, _, _ in rankings], [w for _, w, _ in rankings])
    else:
        total: dict[str, float] = {}
        for hits, w, is_dense in rankings:
            top = max((h.score for h in hits), default=0.0) or 1.0
            for h in hits:
                total[h.doc_id] = total.get(h.doc_id, 0.0) + w * (h.score if is_dense else h.score / top)
        order = sorted(total, key=lambda d: total[d], reverse=True)
    return [Ranked(doc_id, score.get(doc_id, 0.0), quote[doc_id][1]) for doc_id in order]
