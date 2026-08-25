"""Request-scoped dependencies shared across features.

Identity is anonymous by design (no OAuth): a visitor is a random id in a
long-lived cookie, minted on first sight. Chat history, likes and comments
will hang off this id. Nothing else about the person is stored.
"""
from __future__ import annotations

import secrets

from fastapi import Request, Response

VISITOR_COOKIE = "jhl_vid"
VISITOR_TTL = 60 * 60 * 24 * 365  # one year


def get_visitor_id(request: Request, response: Response) -> str:
    vid = request.cookies.get(VISITOR_COOKIE)
    if not vid or len(vid) > 64:
        vid = secrets.token_urlsafe(24)
        response.set_cookie(
            VISITOR_COOKIE,
            vid,
            max_age=VISITOR_TTL,
            httponly=True,
            samesite="lax",
            secure=request.url.scheme == "https",
        )
    return vid
