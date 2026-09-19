"""Request/response shapes for the LSA search demo."""
from __future__ import annotations

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=300)


class SearchResult(BaseModel):
    rank: int
    doc_id: int
    score: float
    category: str
    snippet: str


class SearchResponse(BaseModel):
    results: list[SearchResult]
    matched_terms: list[str]
    n_documents: int
