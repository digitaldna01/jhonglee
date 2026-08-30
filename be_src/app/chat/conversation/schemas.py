"""Wire shapes for /api/chat/sessions/*."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from .domain import Conversation, ConversationSummary, Turn
from .service import ConversationView


class SourceOut(BaseModel):
    id: str
    title: str
    kind: str = ""
    score: float | None = None


class TurnOut(BaseModel):
    question: str
    answer: str
    sources: list[SourceOut]
    model: str
    retrieval_ms: float
    created_at: datetime

    @classmethod
    def of(cls, t: Turn) -> "TurnOut":
        return cls(
            question=t.question, answer=t.answer, model=t.model, retrieval_ms=t.retrieval_ms,
            created_at=t.created_at, sources=[SourceOut(**vars(s)) for s in t.sources],
        )


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    last_at: datetime
    can_continue: bool
    visitor_id: str | None = None  # owner only
    turns: list[TurnOut]

    @classmethod
    def of(cls, view: ConversationView) -> "ConversationOut":
        c: Conversation = view.conversation
        return cls(
            id=c.id, title=c.title, created_at=c.created_at, last_at=c.last_at,
            can_continue=view.can_continue,
            visitor_id=c.visitor_id if view.show_visitor else None,
            turns=[TurnOut.of(t) for t in c.turns],
        )


class ConversationSummaryOut(BaseModel):
    id: str
    title: str
    turn_count: int
    created_at: datetime
    last_at: datetime
    visitor_id: str | None = None  # owner only

    @classmethod
    def of(cls, s: ConversationSummary, *, show_visitor: bool) -> "ConversationSummaryOut":
        return cls(
            id=s.id, title=s.title, turn_count=s.turn_count, created_at=s.created_at, last_at=s.last_at,
            visitor_id=s.visitor_id if show_visitor else None,
        )
