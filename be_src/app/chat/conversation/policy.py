"""Who may do what — the whole access model in one table of pure functions.

                      my conversation   someone else's   unknown id
  read                      ○                 ○              404
  continue (ask more)       ○                 ×              (new)
  list all                  owner only

"The link is the share": an id is a UUID nobody can guess, so knowing it
is the visitor's own doing (decided 2026-08-30 — a share flag was judged
more ceremony than a portfolio chat warrants; if that changes, `can_read`
is the one line to revisit). Continuing is the right that matters — no
one else may append turns under your address. Ownership is the visitor
cookie, so it is per browser: clear it and you read your own thread as a
guest. The owner reads everything and continues only their own.
"""
from __future__ import annotations

from ...core.auth import Principal
from .domain import Conversation


def can_read(who: Principal, conversation: Conversation | None) -> bool:
    return conversation is not None


def can_continue(who: Principal, owner_visitor_id: str | None) -> bool:
    """`owner_visitor_id` None = the id is unclaimed; the first asker claims it."""
    return owner_visitor_id is None or owner_visitor_id == who.visitor_id


def can_list_all(who: Principal) -> bool:
    return who.is_owner


def can_see_visitor(who: Principal) -> bool:
    """Visitor ids are the owner's debugging handle, nobody else's business."""
    return who.is_owner
