"""Posts as the backend knows them — /api/content/*.

The site renders posts from mdx directly; this read-only view exists so
other clients (and other features) share the same ids and metadata.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from . import service
from .schemas import PostSummary

router = APIRouter(prefix="/content", tags=["content"])

_FIELDS = tuple(PostSummary.model_fields)


@router.get("/posts", response_model=list[PostSummary])
def posts():
    return [{k: d[k] for k in _FIELDS} for d in service.list_posts()]


@router.get("/posts/{slug}", response_model=PostSummary)
def post(slug: str):
    doc = service.get(slug)
    if doc is None:
        raise HTTPException(404, "post not found")
    return {k: doc[k] for k in _FIELDS}
