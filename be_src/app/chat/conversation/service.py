"""ConversationService — the use cases, with the policy asked first.

    svc = get_service()
    await svc.begin(who, sid)          # before answering: claim or verify the address
    view = await svc.view(who, sid)    # read back (NotFound when the id is unknown)
    await svc.mine(who) / svc.all(who) # lists (Forbidden: all() for non-owners)

Raises domain errors; the router maps them to status codes.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ...core.auth import Principal
from . import policy
from .domain import Conversation, ConversationSummary, Turn
from .repository import ConversationRepository, SqlConversationRepository, now

WORKING_MEMORY_TURNS = 8  # == history.HISTORY_MAX; the model's window when rebuilt from the log


class NotFound(Exception):
    """Unknown id — or one this principal may not know exists."""


class Forbidden(Exception):
    """Known, but not for this principal to do."""


@dataclass(frozen=True)
class ConversationView:
    """A conversation as one principal sees it."""

    conversation: Conversation
    can_continue: bool
    show_visitor: bool


class ConversationService:
    def __init__(self, repo: ConversationRepository) -> None:
        self._repo = repo

    async def begin(self, who: Principal, sid: str, at: datetime | None = None) -> None:
        """Claim `sid` for `who`, or verify it is theirs to continue."""
        owner = await self._repo.owner_of(sid)
        if not policy.can_continue(who, owner):
            raise Forbidden(sid)
        await self._repo.touch(sid, who.visitor_id, at or now())

    async def view(self, who: Principal, sid: str) -> ConversationView:
        conversation = await self._repo.get(sid)
        if not policy.can_read(who, conversation):
            raise NotFound(sid)
        assert conversation is not None
        return ConversationView(
            conversation=conversation,
            can_continue=policy.can_continue(who, conversation.visitor_id),
            show_visitor=policy.can_see_visitor(who),
        )

    async def mine(self, who: Principal, limit: int = 50) -> list[ConversationSummary]:
        return await self._repo.list_for(who.visitor_id, limit)

    async def all(
        self, who: Principal, limit: int = 50, before: datetime | None = None
    ) -> list[ConversationSummary]:
        if not policy.can_list_all(who):
            raise Forbidden("all")
        return await self._repo.list_all(limit, before)

    async def record(self, sid: str | None, visitor_id: str, turn: Turn) -> None:
        """Append an answered exchange (the stream's epilogue; see chat/chatlog.py)."""
        await self._repo.add_turn(sid, visitor_id, turn)

    async def working_memory(self, sid: str, n: int = WORKING_MEMORY_TURNS) -> tuple[list[dict], list[str]]:
        """(turns as role/content, last turn's source ids) — rebuilds the
        model's context when the cache has forgotten a conversation."""
        turns = await self._repo.recent_turns(sid, n)
        history = [h for t in turns for h in t.as_history()]
        last_sources = [s.id for s in turns[-1].sources] if turns else []
        return history, last_sources


_service: ConversationService | None = None


def get_service() -> ConversationService:
    """Module accessor / FastAPI dependency; the SQL repository behind it."""
    global _service
    if _service is None:
        _service = ConversationService(SqlConversationRepository())
    return _service


def reset_service(service: ConversationService | None = None) -> None:
    """Tests: install a service over a memory repository, or forget the singleton."""
    global _service
    _service = service
