"""Chat API schemas — /api/chat/*."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
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
