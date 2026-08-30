"""HTTP for conversations — mounted by chat/router.py under /api/chat.

GET /api/chat/sessions/{sid}                 the transcript (404 unknown)
GET /api/chat/sessions?scope=mine            this browser's conversations
GET /api/chat/sessions?scope=all[&before=]   every conversation (owner; 403 otherwise)
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from ...core.auth import Principal, get_principal
from . import policy
from .schemas import ConversationOut, ConversationSummaryOut
from .service import ConversationService, Forbidden, NotFound, get_service

router = APIRouter(prefix="/sessions", tags=["chat"])

SID = r"^[A-Za-z0-9_-]{1,64}$"


@router.get("", response_model=list[ConversationSummaryOut])
async def list_sessions(
    scope: Literal["mine", "all"] = "mine",
    before: datetime | None = Query(default=None, description="all: page cursor, last_at strictly before"),
    limit: int = Query(default=50, ge=1, le=200),
    who: Principal = Depends(get_principal),
    svc: ConversationService = Depends(get_service),
):
    try:
        rows = await (svc.all(who, limit, before) if scope == "all" else svc.mine(who, limit))
    except Forbidden:
        raise HTTPException(403, "owner only") from None
    return [ConversationSummaryOut.of(r, show_visitor=policy.can_see_visitor(who)) for r in rows]


@router.get("/{sid}", response_model=ConversationOut)
async def get_session(
    sid: str = Path(pattern=SID),
    who: Principal = Depends(get_principal),
    svc: ConversationService = Depends(get_service),
):
    try:
        return ConversationOut.of(await svc.view(who, sid))
    except NotFound:
        raise HTTPException(404, "conversation not found") from None
