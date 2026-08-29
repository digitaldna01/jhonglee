"""Chat API schemas — /api/chat/*."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    # client-minted per page load; when present the server keeps the history
    session_id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    # older clients send the transcript themselves; ignored once a server session exists
    history: list[ChatTurn] = []


class GraphProject(BaseModel):
    id: str
    title: str
    year: str
    lean: str
    tags: list[str]
    stack: str
    desc: str
    url: str


class GraphEdge(BaseModel):
    a: str
    b: str
    w: float


class GraphResponse(BaseModel):
    projects: list[GraphProject]
    edges: list[GraphEdge]
    retrieval_model: str
