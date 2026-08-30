"""chat.rewrite — when a question is rewritten for retrieval, and how failure degrades."""
from __future__ import annotations

import asyncio

from app.chat import rewrite


def test_only_korean_or_follow_ups_are_rewritten():
    assert not rewrite.needs_rewrite("What did you build with k-means?", [])
    assert rewrite.needs_rewrite("k-means로 뭘 만들었어?", [])
    prev = [{"role": "user", "content": "Tell me about your quantum computing project"}]
    assert rewrite.needs_rewrite("Tell me more about it", prev)
    assert rewrite.needs_rewrite("Which libraries did you compare?", prev)
    assert not rewrite.needs_rewrite("Have you used XGBoost?", prev)  # a new question: search it as is
    assert not rewrite.needs_rewrite("Who are you?", prev)


def test_search_query_uses_the_rewrite_and_falls_back_to_the_question(monkeypatch):
    monkeypatch.setattr(rewrite.get_settings(), "anthropic_api_key", "test-key")
    asked: list[list[dict]] = []

    async def fake_ask(model: str, messages: list[dict]) -> str:
        asked.append(messages)
        return ' "How did the KMeans Clustering project initialise centroids?" \n'

    monkeypatch.setattr(rewrite, "_ask", fake_ask)
    history = [
        {"role": "user", "content": "k-means로 뭘 만들었어?"},
        {"role": "assistant", "content": "KMeans Clustering 프로젝트예요."},
    ]
    q = asyncio.run(rewrite.search_query("초기화 방법은 뭐였어?", history, topic="KMeans Clustering"))
    assert q == "How did the KMeans Clustering project initialise centroids?"  # quotes/whitespace stripped
    sent = asked[0][0]["content"]
    assert "k-means로 뭘 만들었어?" in sent and 'about "KMeans Clustering"' in sent  # conversation + topic went along

    # English first question: no call at all
    assert asyncio.run(rewrite.search_query("What did you build with k-means?", [])) == "What did you build with k-means?"
    assert len(asked) == 1

    # the model failing, or answering instead of rewriting, leaves the original question
    async def boom(model: str, messages: list[dict]) -> str:
        raise RuntimeError("quota")

    monkeypatch.setattr(rewrite, "_ask", boom)
    assert asyncio.run(rewrite.search_query("초기화 방법은 뭐였어?", history)) == "초기화 방법은 뭐였어?"

    async def essay(model: str, messages: list[dict]) -> str:
        return "x" * 400

    monkeypatch.setattr(rewrite, "_ask", essay)
    assert asyncio.run(rewrite.search_query("초기화 방법은 뭐였어?", history)) == "초기화 방법은 뭐였어?"

    async def korean(model: str, messages: list[dict]) -> str:  # followed the conversation's language
        return "KMeans Clustering의 초기화 방법은 무엇인가요?"

    monkeypatch.setattr(rewrite, "_ask", korean)
    assert asyncio.run(rewrite.search_query("초기화 방법은 뭐였어?", history)) == "초기화 방법은 뭐였어?"


def test_no_key_means_no_rewrite_and_the_anchor_is_the_fallback(monkeypatch):
    monkeypatch.setattr(rewrite.get_settings(), "anthropic_api_key", "")
    assert asyncio.run(rewrite.rewrite("초기화 방법은 뭐였어?", [])) is None
    prev = [{"role": "user", "content": "k-means로 뭘 만들었어?"}]
    # needed but unavailable → search the original, anchored to the previous topic
    assert asyncio.run(rewrite.search_plan("초기화 방법은 뭐였어?", prev, topic="KMeans Clustering")) == (
        "초기화 방법은 뭐였어?", "KMeans Clustering")
    # not needed (a new English question) → no anchor either
    assert asyncio.run(rewrite.search_plan("Have you used XGBoost?", prev, topic="KMeans Clustering")) == (
        "Have you used XGBoost?", None)


def test_greetings_skip_retrieval_and_the_first_line_is_the_query(monkeypatch):
    monkeypatch.setattr(rewrite.get_settings(), "anthropic_api_key", "test-key")

    async def sentinel(model: str, messages: list[dict]) -> str:
        return "NO_RETRIEVAL\n"

    monkeypatch.setattr(rewrite, "_ask", sentinel)
    assert asyncio.run(rewrite.search_plan("안녕하세요!", [])) == (None, None)

    async def chatty(model: str, messages: list[dict]) -> str:  # a second line of explanation is dropped
        return "→ How was the Gill Sans stop-motion video shot?\nThis resolves the reference."

    monkeypatch.setattr(rewrite, "_ask", chatty)
    assert asyncio.run(rewrite.search_query("그거 어떻게 찍었어?", [])) == "How was the Gill Sans stop-motion video shot?"
