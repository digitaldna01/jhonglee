"""Owner login — /api/auth/*.

POST   /api/auth/owner  {token}   → 204 + jhl_owner cookie (401 wrong, 404 when no OWNER_TOKEN is set)
DELETE /api/auth/owner            → 204, cookie cleared
GET    /api/auth/me               → {"owner": bool}

The token check is rate-limited per IP so the secret cannot be guessed
online; the cookie itself is validated by core.auth.get_principal.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..core import auth
from ..core.cache import get_cache
from ..core.config import get_settings
from ..core.deps import get_client_ip
from ..core.ratelimit import RateLimited, RateLimiter

router = APIRouter(prefix="/auth", tags=["auth"])

LOGIN_ATTEMPTS_PER_MINUTE = 5


class OwnerLogin(BaseModel):
    token: str = Field(min_length=1, max_length=256)


@router.post("/owner", status_code=204)
async def login(body: OwnerLogin, request: Request, response: Response) -> Response:
    if not get_settings().owner_token:
        raise HTTPException(404, "owner login is not configured")
    try:
        await RateLimiter(get_cache()).hit(
            f"rl:auth:min:ip:{get_client_ip(request)}", LOGIN_ATTEMPTS_PER_MINUTE, 60, scope="ip"
        )
    except RateLimited as e:
        raise HTTPException(429, "too many attempts", headers={"Retry-After": str(e.retry_after)}) from None
    if not auth.token_matches(body.token):
        raise HTTPException(401, "wrong token")
    auth.grant_owner(request, response)
    response.status_code = 204
    return response


@router.delete("/owner", status_code=204)
def logout(response: Response) -> Response:
    auth.revoke_owner(response)
    response.status_code = 204
    return response


@router.get("/me")
def me(who: auth.Principal = Depends(auth.get_principal)) -> dict:
    return {"owner": who.is_owner}
