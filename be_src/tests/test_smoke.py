"""Smoke tests: every feature answers, the chat stream has its shape."""
from fastapi.testclient import TestClient

from app.main import app


def _client():
    return TestClient(app)


def test_health():
    with _client() as c:
        assert c.get("/api/health").json() == {"status": "ok"}


def test_content_posts_and_lookup():
    with _client() as c:
        posts = c.get("/api/content/posts").json()
        assert posts and all(p["url"].startswith("/posts/") for p in posts)
        slug = posts[0]["id"]
        assert c.get(f"/api/content/posts/{slug}").json()["id"] == slug
        assert c.get("/api/content/posts/nope").status_code == 404


def test_chat_graph_nodes_match_content():
    with _client() as c:
        g = c.get("/api/chat/graph").json()
        ids = {p["id"] for p in g["projects"]}
        assert ids and all(e["a"] in ids and e["b"] in ids for e in g["edges"])


def test_chat_stream_event_order():
    with _client() as c:
        r = c.post("/api/chat/stream", json={"question": "Who are you?"})
        assert r.status_code == 200
        events = [line.split(": ", 1)[1] for line in r.text.splitlines() if line.startswith("event:")]
        assert events[0] == "sources" and events[-1] == "done" and "delta" in events


def test_kmeans_dataset():
    with _client() as c:
        assert len(c.get("/api/kmeans/dataset?n=10&seed=1").json()["points"]) == 10
