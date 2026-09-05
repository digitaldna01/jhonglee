"""scripts/mine_golden.py — pure mining/merging over chat_logs rows."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import mine_golden as mg  # scripts/ is on the path (pyproject.toml)

T0 = datetime(2026, 8, 29, 12, 0, tzinfo=timezone.utc)


def _row(q, ids, *, t=0, session="s1", visitor="v1", model="claude-haiku-4-5", score=0.4):
    return {
        "visitor_id": visitor,
        "session_id": session,
        "question": q,
        "sources": [{"id": i, "kind": "post", "title": i, "score": score} for i in ids],
        "model": model,
        "created_at": T0 + timedelta(minutes=t),
    }


GOLDEN = {"_comment": "x", "en": [{"q": "Who are you?", "expect": ["bio"]}], "ko": [], "followup": []}


def test_mine_skips_known_questions_pairs_followups_and_flags():
    rows = [
        _row("Who are you?", ["bio"]),  # already in the golden set
        _row("What did you build with k-means?", ["cogsAndGears", "kmeansVisualizer"], t=100, score=0.32),  # >30 min: fresh
        _row("How did you initialise the centroids?", ["kmeansVisualizer"], t=101),
        _row("How did you initialise the centroids?", ["handPoseGeneration"], t=102, model="extractive fallback", score=0.1),
        _row("블렌더로 만든 거 있어?", ["cogsAndGears"], t=300),  # hours later: not a follow-up
    ]
    cands = mg.mine(rows, GOLDEN)
    assert [c["q"] for c in cands] == [
        "What did you build with k-means?",
        "How did you initialise the centroids?",
        "How did you initialise the centroids?",
        "블렌더로 만든 거 있어?",
    ]
    kmeans, fu, again, ko = cands
    assert kmeans["prev"] is None and kmeans["got"][0] == "cogsAndGears" and kmeans["flags"] == []
    assert fu["prev"] == "What did you build with k-means?" and fu["type"] == "A"
    assert set(again["flags"]) == {"low-score", "fallback", "repeat"}
    assert ko["lang"] == "ko" and ko["prev"] is None
    assert all(c["expect"] == [] for c in cands)
    assert len(mg.mine(rows, GOLDEN, include_known=True)) == 5


def test_merge_appends_labelled_cases_by_bucket_and_keeps_the_rest():
    golden = {k: (list(v) if isinstance(v, list) else v) for k, v in GOLDEN.items()}
    cands = [
        {"q": "What did you build with k-means?", "lang": "en", "prev": None, "expect": ["kmeansVisualizer"]},
        {"q": "How did you initialise the centroids?", "lang": "en", "prev": "What did you build with k-means?",
         "type": None, "expect": ["kmeansVisualizer"]},
        {"q": "블렌더로 만든 거 있어?", "lang": "ko", "prev": None, "expect": ["cogsAndGears"]},
        {"q": "Who are you?", "lang": "en", "prev": None, "expect": ["bio"]},  # duplicate: dropped
        {"q": "unlabelled", "lang": "en", "prev": None, "expect": []},
    ]
    added, rest = mg.merge(cands, golden)
    assert added == 3 and [c["q"] for c in rest] == ["unlabelled"]
    assert golden["en"][-1]["q"] == "What did you build with k-means?"
    assert golden["ko"] == [{"q": "블렌더로 만든 거 있어?", "expect": ["cogsAndGears"]}]
    assert golden["followup"] == [{"type": "A", "prev": "What did you build with k-means?",
                                   "q": "How did you initialise the centroids?", "expect": ["kmeansVisualizer"]}]


def test_parse_since():
    assert mg.parse_since("all") is None
    week, hour = mg.parse_since("7d"), mg.parse_since("1h")
    assert week is not None and hour is not None and week < hour
