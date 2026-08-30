"""Who is asking — the request's Principal.

Identity stays anonymous (no accounts). Every browser is a Visitor, known
by the random `jhl_vid` cookie that core.deps mints on first sight. The
site owner is the same kind of thing with one more right: an Owner is a
Visitor whose browser also carries `jhl_owner`, obtained once by presenting
OWNER_TOKEN (POST /api/auth/owner). Owner *is a* Visitor on purpose — the
owner's own conversations are theirs like anyone's; the extra right is
reading everyone's (see chat/conversation/policy.py).

    async def endpoint(who: Principal = Depends(get_principal)): ...

The owner cookie holds a digest of the token, never the token: rotating
OWNER_TOKEN logs every browser out, and a leaked cookie does not leak the
secret it was made from.
"""
from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass

from fastapi import Depends, Request, Response

from .config import get_settings
from .deps import get_visitor_id

OWNER_COOKIE = "jhl_owner"
OWNER_TTL = 60 * 60 * 24 * 30  # a month, then present the token again


@dataclass(frozen=True)
class Principal:
    """Anyone who can make a request. Concrete kinds below; match on them
    with isinstance or ask `is_owner` — never on a string role."""

    visitor_id: str

    @property
    def is_owner(self) -> bool:
        return False


@dataclass(frozen=True)
class Visitor(Principal):
    """An anonymous browser."""


@dataclass(frozen=True)
class Owner(Visitor):
    """The site owner's browser: a Visitor with the right to read everything."""

    @property
    def is_owner(self) -> bool:
        return True


def owner_cookie_value(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def token_matches(presented: str) -> bool:
    configured = get_settings().owner_token
    return bool(configured) and hmac.compare_digest(presented, configured)


def _cookie_is_owner(value: str | None) -> bool:
    configured = get_settings().owner_token
    if not configured or not value:
        return False
    return hmac.compare_digest(value, owner_cookie_value(configured))


def get_principal(request: Request, visitor_id: str = Depends(get_visitor_id)) -> Principal:
    if _cookie_is_owner(request.cookies.get(OWNER_COOKIE)):
        return Owner(visitor_id)
    return Visitor(visitor_id)


def grant_owner(request: Request, response: Response) -> None:
    response.set_cookie(
        OWNER_COOKIE,
        owner_cookie_value(get_settings().owner_token),
        max_age=OWNER_TTL,
        httponly=True,
        samesite="strict",
        secure=request.url.scheme == "https",
    )


def revoke_owner(response: Response) -> None:
    response.delete_cookie(OWNER_COOKIE)
