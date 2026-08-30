"""Storage for conversations, behind a Protocol (rule 2: no feature code
touches a client library; here, no service code touches SQLAlchemy).

Two tables, one writer each way:
  chat_sessions  the address — id (client-minted UUID), visitor_id, created_at, last_at
  chat_logs      the turns   — appended by add_turn (via chat/chatlog.py) after every answer

Implementations: SqlConversationRepository (Postgres or the SQLite
fallback, through core.db) and MemoryConversationRepository (tests, and
anything that wants the rules without a database).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ...core.db import session_factory
from ..models import ChatLog, ChatSession
from .domain import Conversation, ConversationSummary, Source, Turn, title_of


class ConversationRepository(Protocol):
    async def get(self, sid: str) -> Conversation | None: ...
    async def owner_of(self, sid: str) -> str | None: ...
    async def touch(self, sid: str, visitor_id: str, at: datetime) -> None:
        """Create the session row for `visitor_id` if new, else bump last_at."""
        ...
    async def add_turn(self, sid: str | None, visitor_id: str, turn: Turn) -> None: ...
    async def recent_turns(self, sid: str, n: int) -> list[Turn]: ...
    async def list_for(self, visitor_id: str, limit: int) -> list[ConversationSummary]: ...
    async def list_all(self, limit: int, before: datetime | None) -> list[ConversationSummary]: ...


def now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)  # SQLite drops the zone


# ---------------------------------------------------------------- SQL


def _turn(row: ChatLog) -> Turn:
    return Turn(
        question=row.question,
        answer=row.answer,
        sources=tuple(
            Source(id=s["id"], title=s.get("title", s["id"]), kind=s.get("kind", ""), score=s.get("score"))
            for s in (row.sources or [])
        ),
        model=row.model,
        retrieval_ms=row.retrieval_ms,
        created_at=_aware(row.created_at),
        input_tokens=row.input_tokens,
        output_tokens=row.output_tokens,
    )


class SqlConversationRepository:
    def __init__(self, sessions: async_sessionmaker[AsyncSession] | None = None) -> None:
        self._sessions = sessions  # None → core.db's, resolved lazily so the app boots without a DB

    def _open(self) -> AsyncSession:
        return (self._sessions or session_factory())()

    async def get(self, sid: str) -> Conversation | None:
        async with self._open() as s:
            row = await s.get(ChatSession, sid)
            if row is None:
                return None
            logs = (
                await s.execute(
                    select(ChatLog).where(ChatLog.session_id == sid).order_by(ChatLog.created_at, ChatLog.id)
                )
            ).scalars().all()
        return Conversation(
            id=row.id,
            visitor_id=row.visitor_id,
            created_at=_aware(row.created_at),
            last_at=_aware(row.last_at),
            turns=tuple(_turn(l) for l in logs),
        )

    async def owner_of(self, sid: str) -> str | None:
        async with self._open() as s:
            return (await s.execute(select(ChatSession.visitor_id).where(ChatSession.id == sid))).scalar()

    async def touch(self, sid: str, visitor_id: str, at: datetime) -> None:
        async with self._open() as s, s.begin():
            row = await s.get(ChatSession, sid)
            if row is None:
                s.add(ChatSession(id=sid, visitor_id=visitor_id, created_at=at, last_at=at))
            else:
                row.last_at = at

    async def add_turn(self, sid: str | None, visitor_id: str, turn: Turn) -> None:
        async with self._open() as s, s.begin():
            s.add(
                ChatLog(
                    visitor_id=visitor_id,
                    session_id=sid,
                    question=turn.question,
                    sources=[
                        {"id": x.id, "kind": x.kind, "title": x.title, "score": x.score} for x in turn.sources
                    ],
                    answer=turn.answer,
                    model=turn.model,
                    retrieval_ms=turn.retrieval_ms,
                    input_tokens=turn.input_tokens,
                    output_tokens=turn.output_tokens,
                    created_at=turn.created_at,
                )
            )

    async def recent_turns(self, sid: str, n: int) -> list[Turn]:
        async with self._open() as s:
            logs = (
                await s.execute(
                    select(ChatLog)
                    .where(ChatLog.session_id == sid)
                    .order_by(ChatLog.created_at.desc(), ChatLog.id.desc())
                    .limit(n)
                )
            ).scalars().all()
        return [_turn(l) for l in reversed(logs)]

    async def list_for(self, visitor_id: str, limit: int) -> list[ConversationSummary]:
        stmt = (
            select(ChatSession).where(ChatSession.visitor_id == visitor_id)
            .order_by(ChatSession.last_at.desc()).limit(limit)
        )
        return await self._summaries(stmt)

    async def list_all(self, limit: int, before: datetime | None) -> list[ConversationSummary]:
        stmt = select(ChatSession).order_by(ChatSession.last_at.desc()).limit(limit)
        if before is not None:
            stmt = stmt.where(ChatSession.last_at < before)
        return await self._summaries(stmt)

    async def _summaries(self, stmt) -> list[ConversationSummary]:
        async with self._open() as s:
            rows = (await s.execute(stmt)).scalars().all()
            ids = [r.id for r in rows]
            if not ids:
                return []
            counts = dict(
                (await s.execute(
                    select(ChatLog.session_id, func.count()).where(ChatLog.session_id.in_(ids))
                    .group_by(ChatLog.session_id)
                )).all()
            )
            first_ids = (
                await s.execute(
                    select(func.min(ChatLog.id)).where(ChatLog.session_id.in_(ids)).group_by(ChatLog.session_id)
                )
            ).scalars().all()
            firsts = dict(
                (await s.execute(
                    select(ChatLog.session_id, ChatLog.question).where(ChatLog.id.in_(first_ids))
                )).all()
            ) if first_ids else {}
        return [
            ConversationSummary(
                id=r.id,
                visitor_id=r.visitor_id,
                created_at=_aware(r.created_at),
                last_at=_aware(r.last_at),
                title=title_of(firsts.get(r.id)),
                turn_count=int(counts.get(r.id, 0)),
            )
            for r in rows
        ]


# ------------------------------------------------------------- memory


class MemoryConversationRepository:
    """Dict-backed twin of the SQL repository — same contract, no I/O."""

    def __init__(self) -> None:
        self._sessions: dict[str, tuple[str, datetime, datetime]] = {}  # sid → (visitor, created, last)
        self._turns: dict[str | None, list[tuple[str, Turn]]] = {}  # sid → [(visitor, turn)]

    async def get(self, sid: str) -> Conversation | None:
        meta = self._sessions.get(sid)
        if meta is None:
            return None
        visitor, created, last = meta
        return Conversation(sid, visitor, created, last, tuple(t for _, t in self._turns.get(sid, [])))

    async def owner_of(self, sid: str) -> str | None:
        meta = self._sessions.get(sid)
        return meta[0] if meta else None

    async def touch(self, sid: str, visitor_id: str, at: datetime) -> None:
        meta = self._sessions.get(sid)
        self._sessions[sid] = (visitor_id, at, at) if meta is None else (meta[0], meta[1], at)

    async def add_turn(self, sid: str | None, visitor_id: str, turn: Turn) -> None:
        self._turns.setdefault(sid, []).append((visitor_id, turn))

    async def recent_turns(self, sid: str, n: int) -> list[Turn]:
        return [t for _, t in self._turns.get(sid, [])][-n:]

    async def list_for(self, visitor_id: str, limit: int) -> list[ConversationSummary]:
        return [c for c in await self._all() if c.visitor_id == visitor_id][:limit]

    async def list_all(self, limit: int, before: datetime | None) -> list[ConversationSummary]:
        rows = await self._all()
        if before is not None:
            rows = [c for c in rows if c.last_at < before]
        return rows[:limit]

    async def _all(self) -> list[ConversationSummary]:
        convs = [await self.get(sid) for sid in self._sessions]
        return sorted((c.summary() for c in convs if c), key=lambda c: c.last_at, reverse=True)
