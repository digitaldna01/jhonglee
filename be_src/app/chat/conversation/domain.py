"""Values, not rows. Frozen so a Conversation handed to a view or a test
cannot drift; built by the repository from chat_sessions + chat_logs."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

TITLE_MAX = 80


@dataclass(frozen=True)
class Source:
    id: str
    title: str
    kind: str = ""
    score: float | None = None
    url: str | None = None  # None: cite without a link (bio); absent in logs before 2026-08-30


@dataclass(frozen=True)
class Turn:
    """One exchange: a question and the answer it got, with what was retrieved."""

    question: str
    answer: str
    sources: tuple[Source, ...]
    model: str
    retrieval_ms: float
    created_at: datetime
    input_tokens: int | None = None
    output_tokens: int | None = None

    def as_history(self) -> list[dict]:
        """The shape the model is given as prior context."""
        return [{"role": "user", "content": self.question}, {"role": "assistant", "content": self.answer}]


def title_of(first_question: str | None) -> str:
    q = " ".join((first_question or "").split())
    return q if len(q) <= TITLE_MAX else q[: TITLE_MAX - 1].rstrip() + "…"


@dataclass(frozen=True)
class ConversationSummary:
    """A row in a list: enough to recognise a conversation, not to read it."""

    id: str
    visitor_id: str
    created_at: datetime
    last_at: datetime
    title: str
    turn_count: int


@dataclass(frozen=True)
class Conversation:
    id: str
    visitor_id: str
    created_at: datetime
    last_at: datetime
    turns: tuple[Turn, ...] = field(default_factory=tuple)

    @property
    def title(self) -> str:
        return title_of(self.turns[0].question if self.turns else None)

    def summary(self) -> ConversationSummary:
        return ConversationSummary(
            self.id, self.visitor_id, self.created_at, self.last_at, self.title, len(self.turns)
        )
