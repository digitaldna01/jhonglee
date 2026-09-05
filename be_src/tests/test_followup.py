"""Follow-up handling: the contextual query, session last_sources, and the anchor
(retrieval.rrf stays available as the alternative fusion — see hybrid.rank)."""
from __future__ import annotations

import asyncio

from app.chat import history, retrieval, rewrite
from app.content.repository import by_id


def _title(doc_id: str) -> str:
    doc = by_id(doc_id)
    assert doc is not None
    return doc["title"]


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
    quantum, blender = _title("quantumSimulator"), _title("cogsAndGears")

    async def run():
        anchored = await retrieval.retrieve(
            "Which libraries did you compare?", k=4, context_title=quantum
        )
        assert anchored[0]["id"] == "quantumSimulator"
        more = await retrieval.retrieve("Tell me more about it", k=4, context_title=blender)
        assert more[0]["id"] == "cogsAndGears"
        # a topic switch: the plan drops the anchor for a question with nothing to
        # resolve (anchored, this case sat within 0.005 of sticking to quantum)
        query, anchor = await rewrite.search_plan("Have you used XGBoost?", [{"role": "user", "content": "…"}], topic=quantum)
        assert query is not None and anchor is None
        switched = await retrieval.retrieve(query, k=4, context_title=anchor)
        assert switched[0]["id"] == "handPoseGeneration"

    asyncio.run(run())


def test_generation_topic_prefers_the_project_the_rewrite_named():
    from app.chat.service import topic_named

    assert topic_named("How was the Cogs and Gears project made with Blender?", "Smart Factory Dashboard") == "Cogs and Gears"
    assert topic_named("How was that made?", "Smart Factory Dashboard") == "Smart Factory Dashboard"
    assert topic_named(None, "Smart Factory Dashboard") == "Smart Factory Dashboard"  # (service passes None on NO_RETRIEVAL)


def test_index_doc_competes_only_for_enumeration_questions():
    assert retrieval.is_enumeration("List all your projects.")
    assert retrieval.is_enumeration("What have you made?") and retrieval.is_enumeration("프로젝트 전부 알려줘")
    assert not retrieval.is_enumeration("Do you have any typography work?")

    async def run():
        listed = await retrieval.retrieve("List all your projects.", k=4)
        assert listed[0]["id"] == "projectIndex"
        typo = await retrieval.retrieve("Do you have any typography work?", k=4)
        assert all(h["kind"] != "index" for h in typo)

    asyncio.run(run())
