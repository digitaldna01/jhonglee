"""Content service — what other features are allowed to ask about posts.

Cross-feature access goes through here (never through repository
internals): social validates slugs with `exists()`, chat builds its
graph from `nodes()`.
"""
from __future__ import annotations

from . import repository


def list_posts() -> list[dict]:
    """Docs that have a page on the site (posts and projects)."""
    return [d for d in repository.DOCS if d["url"]]


def get(slug: str) -> dict | None:
    doc = repository.by_id(slug)
    return doc if doc and doc["url"] else None


def exists(slug: str) -> bool:
    return get(slug) is not None


def get_any(doc_id: str) -> dict | None:
    """Any corpus doc by id, page or not (bio, notes) — for internal lookups."""
    return repository.by_id(doc_id)


def nodes() -> list[dict]:
    """Docs shown on the landing graph."""
    return repository.NODES
