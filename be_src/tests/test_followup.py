"""Follow-up handling: RRF fusion, the contextual query, and last_question."""
from __future__ import annotations

import asyncio

from app.chat import history, retrieval
from app.content.repository import by_id


def test_rrf_prefers_docs_ranked_well_in_both():
    fused = retrieval.rrf([["a", "b", "c"], ["b", "a", "d"]])
    assert fused[:2] in (["a", "b"], ["b", "a"])  # tie at the top, order irrelevant
    assert fused.index("c") < fused.index("d") or fused.index("d") < fused.index("c")
    assert set(fused) == {"a", "b", "c", "d"}
    assert retrieval.rrf([["x"]]) == ["x"]
    # weights: a lighter second ranking cannot overturn the first
    assert retrieval.rrf([["a", "b"], ["b", "a"]], [1.0, 0.6])[0] == "a"


def test_session_keeps_last_sources_and_contextual_query():
    async def run():
        assert await history.load_session("v", "s") == {"turns": [], "last_sources": []}
        await history.append("v", "s", "q", "a", sources=["kmeansVisualizer", "bio"])
        sess = await history.load_session("v", "s")
        assert sess["last_sources"] == ["kmeansVisualizer", "bio"] and len(sess["turns"]) == 2

    asyncio.run(run())
    assert retrieval.contextual_query("how?", "KMeans Clustering") == "how? KMeans Clustering"


def test_retrieve_anchors_ellipsis_without_sticking_on_topic_switch():
    # cases the golden set shows the title anchor fixes / must not break
    quantum, blender = by_id("quantumSimulator")["title"], by_id("cogsAndGears")["title"]

    async def run():
        anchored = await retrieval.retrieve(
            "Which libraries did you compare?", k=4, context_title=quantum
        )
        assert anchored[0]["id"] == "quantumSimulator"
        more = await retrieval.retrieve("Tell me more about it", k=4, context_title=blender)
        assert more[0]["id"] == "cogsAndGears"
        switched = await retrieval.retrieve("Have you used XGBoost?", k=4, context_title=quantum)
        assert switched[0]["id"] == "handPoseEstimation"

    asyncio.run(run())
