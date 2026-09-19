"""LSA search API — /api/lsa/*."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from . import service
from .schemas import SearchRequest, SearchResponse

router = APIRouter(prefix="/lsa", tags=["lsa"])


@router.post("/search", response_model=SearchResponse)
def search(req: SearchRequest):
    if not service.available():
        raise HTTPException(
            503,
            "LSA demo artifacts missing — run `python scripts/build_lsa_demo.py` in be_src",
        )
    return service.search(req.query)
