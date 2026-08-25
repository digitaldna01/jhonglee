"""Content API schemas — /api/content/*."""
from __future__ import annotations

from pydantic import BaseModel


class PostSummary(BaseModel):
    id: str
    kind: str
    title: str
    date: str
    year: str | None
    lean: str | None
    tags: list[str]
    stack: str | None
    summary: str
    thumbnail: str | None
    url: str
