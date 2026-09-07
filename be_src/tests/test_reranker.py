"""The cross-encoder rerank step — pure pieces, and the retrieve() wiring."""
import asyncio

from app.chat import retrieval
from app.chat.retrieval import reranker
from app.chat.retrieval.hybrid import Ranked
from app.chat.store import Hit


class FakeEncoder:
    """Scores a passage by how early its first letter sorts — deterministic,
    and positive (above the gate) for lowercase ascii."""

    def rerank(self, query, passages):
        return [200 - ord(p[0]) for p in passages]


def _ranked(*doc_ids):
    return [
        Ranked(d, 0.5, Hit(doc_id=d, heading=None, text=f"{d} body", score=0.5, is_summary=False))
        for d in doc_ids
    ]


def test_reranked_reorders_the_head_only():
    # FakeEncoder favours passages whose first letter sorts earliest; unknown
    # ids keep the doc_id as the passage title, so the order is alphabetical
    ranked = _ranked("ccc", "aaa", "bbb")
    out = asyncio.run(retrieval.reranked("typography work?", ranked, FakeEncoder()))
    assert [r.doc_id for r in out] == ["aaa", "bbb", "ccc"]


def test_reranked_skips_korean_queries():
    # the model is English-only; a Hangul query (rewrite fell through) is left alone
    ranked = _ranked("visualArtPortfolio", "gillSans")
    out = asyncio.run(retrieval.reranked("폰트 작업 있어?", ranked, FakeEncoder()))
    assert [r.doc_id for r in out] == ["visualArtPortfolio", "gillSans"]


def test_reranked_without_encoder_is_identity():
    ranked = _ranked("a", "b")
    assert asyncio.run(retrieval.reranked("anything", ranked, None)) == ranked


def test_passage_names_the_location():
    assert reranker.passage("Gill Sans", None, "text") == "Gill Sans / introduction: text"
    assert reranker.passage("Gill Sans", "The making of", "t") == "Gill Sans / The making of: t"


def test_gate_keeps_hybrid_order_when_nothing_is_confident():
    # a meta question scores every passage low: no passer, identity order
    assert reranker.order([-5.0, -1.2, -7.3]) == [0, 1, 2]
    # one confident passage moves up; the unconfident keep their order
    assert reranker.order([-5.0, 3.1, -7.3]) == [1, 0, 2]
