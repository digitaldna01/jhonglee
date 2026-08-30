"""A conversation as a thing with an address — /api/chat/sessions/*.

The stream endpoint answers questions; this package is everything that
happens to the transcript afterwards: reading it back by id, listing it,
and deciding who may. Layers, thinnest at the edge:

  domain.py      Conversation · Turn · Source — immutable values assembled
                 from the tables, not ORM rows
  repository.py  ConversationRepository (Protocol) — SqlConversationRepository
                 over chat_sessions + chat_logs · MemoryConversationRepository
                 for tests
  policy.py      the access rules, pure functions over (Principal, Conversation)
  service.py     ConversationService: asks policy, calls repository, raises
                 NotFound / Forbidden — transport-free
  schemas.py     wire shapes
  router.py      HTTP only; mounted under chat/router.py

Identity comes from core.auth (Visitor | Owner). Writes of turns still go
through chat/chatlog.py (best-effort, after streaming) — it delegates to
the repository, so chat_logs has one writer.
"""
from .domain import Conversation, ConversationSummary, Source, Turn
from .service import ConversationService, Forbidden, NotFound, get_service

__all__ = [
    "Conversation", "ConversationSummary", "Source", "Turn",
    "ConversationService", "Forbidden", "NotFound", "get_service",
]
