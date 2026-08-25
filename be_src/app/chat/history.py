"""Server-side chat sessions — planned, cache-backed.

Design (to implement when the feature is built):

  key      chat:session:{visitor_id}:{session_id}
  value    {"turns": [{"role", "content", "ts"}], "started": ts}
  ttl      CHAT_HISTORY_TTL_DAYS (7) via core.cache — Redis in production
  api      append(visitor_id, session_id, turn) / load(...) / clear(...)

The router keeps accepting client-supplied history until this lands, so
the feature can be switched on without a frontend change.
"""
from __future__ import annotations
