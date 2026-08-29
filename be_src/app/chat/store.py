"""Vector stores — where chunk embeddings live and how they are searched.

Two implementations behind one small interface, chosen by DATABASE_URL:

  PgVectorStore  Postgres + pgvector (production, docker-compose)
  MemoryStore    numpy in-process (SQLite fallback: pytest / uvicorn
                 without Docker). Re-embeds the corpus on every start,
                 exactly what the backend did before pgvector.

Both return the same row shape from `search`, and neither knows about
prompts, SSE or corpus.json — ingest feeds them, retrieval queries them.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..core.db import session_factory
from .models import RagChunk, RagDocument


@dataclass(frozen=True)
class ChunkRow:
    id: str
    doc_id: str
    heading: str | None
    text: str
    passage: str
    hash: str
    is_summary: bool
    model: str


@dataclass(frozen=True)
class Hit:
    doc_id: str
    heading: str | None
    text: str
    is_summary: bool
    score: float  # cosine similarity


class VectorStore(Protocol):
    async def existing_chunk_ids(self) -> set[str]: ...

    async def apply(
        self,
        docs: list[dict],
        new_chunks: list[tuple[ChunkRow, np.ndarray]],
        stale_chunk_ids: set[str],
    ) -> None:
        """One atomic sync step: upsert docs, drop docs/chunks no longer in the
        corpus, insert the freshly embedded chunks."""
        ...

    async def summary_vectors(self) -> dict[str, np.ndarray]:
        """doc_id → its summary chunk's vector (graph edges are built from these)."""
        ...

    async def search(self, qvec: np.ndarray, k: int) -> list[Hit]:
        """Top-k documents by their best chunk, best chunk included."""
        ...


# --------------------------------------------------------------------------
# Postgres + pgvector
# --------------------------------------------------------------------------


class PgVectorStore:
    async def existing_chunk_ids(self) -> set[str]:
        async with session_factory()() as s:
            return set((await s.scalars(select(RagChunk.id))).all())

    async def apply(self, docs, new_chunks, stale_chunk_ids) -> None:
        doc_ids = [d["id"] for d in docs]
        async with session_factory()() as s, s.begin():
            if docs:
                stmt = pg_insert(RagDocument).values(
                    [
                        {
                            "id": d["id"],
                            "kind": d["kind"],
                            "title": d["title"],
                            "tags": d["tags"],
                            "summary": d["summary"],
                            "url": d["url"],
                            "node": d["node"],
                        }
                        for d in docs
                    ]
                )
                await s.execute(
                    stmt.on_conflict_do_update(
                        index_elements=[RagDocument.id],
                        set_={c: getattr(stmt.excluded, c) for c in ("kind", "title", "tags", "summary", "url", "node")},
                    )
                )
            await s.execute(delete(RagDocument).where(RagDocument.id.not_in(doc_ids)))
            if stale_chunk_ids:
                await s.execute(delete(RagChunk).where(RagChunk.id.in_(stale_chunk_ids)))
            if new_chunks:
                s.add_all(
                    RagChunk(**row.__dict__, embedding=vec.tolist()) for row, vec in new_chunks
                )

    async def summary_vectors(self) -> dict[str, np.ndarray]:
        async with session_factory()() as s:
            rows = await s.execute(
                select(RagChunk.doc_id, RagChunk.embedding).where(RagChunk.is_summary)
            )
            return {doc_id: np.asarray(vec, dtype=np.float32) for doc_id, vec in rows}

    async def search(self, qvec: np.ndarray, k: int) -> list[Hit]:
        dist = RagChunk.embedding.cosine_distance(qvec.tolist())
        # best chunk per document (DISTINCT ON), then the top-k documents
        best = (
            select(
                RagChunk.doc_id,
                RagChunk.heading,
                RagChunk.text,
                RagChunk.is_summary,
                (1 - dist).label("score"),
            )
            .distinct(RagChunk.doc_id)
            .order_by(RagChunk.doc_id, dist)
            .subquery()
        )
        stmt = select(best).order_by(best.c.score.desc()).limit(k)
        async with session_factory()() as s:
            rows = await s.execute(stmt)
            return [
                Hit(doc_id=r.doc_id, heading=r.heading, text=r.text, is_summary=r.is_summary, score=float(r.score))
                for r in rows
            ]


# --------------------------------------------------------------------------
# In-process numpy (fallback)
# --------------------------------------------------------------------------


class MemoryStore:
    def __init__(self) -> None:
        self._chunks: dict[str, tuple[ChunkRow, np.ndarray]] = {}

    async def existing_chunk_ids(self) -> set[str]:
        return set(self._chunks)

    async def apply(self, docs, new_chunks, stale_chunk_ids) -> None:
        doc_ids = {d["id"] for d in docs}
        for cid in list(self._chunks):
            if cid in stale_chunk_ids or self._chunks[cid][0].doc_id not in doc_ids:
                del self._chunks[cid]
        for row, vec in new_chunks:
            self._chunks[row.id] = (row, np.asarray(vec, dtype=np.float32))

    async def summary_vectors(self) -> dict[str, np.ndarray]:
        return {row.doc_id: vec for row, vec in self._chunks.values() if row.is_summary}

    async def search(self, qvec: np.ndarray, k: int) -> list[Hit]:
        if not self._chunks:
            return []
        rows = list(self._chunks.values())
        mat = np.stack([vec for _, vec in rows])
        norms = np.linalg.norm(mat, axis=1) * (np.linalg.norm(qvec) or 1.0)
        scores = mat @ qvec / np.where(norms == 0, 1.0, norms)
        best: dict[str, Hit] = {}
        for (row, _), s in zip(rows, scores):
            cur = best.get(row.doc_id)
            if cur is None or s > cur.score:
                best[row.doc_id] = Hit(row.doc_id, row.heading, row.text, row.is_summary, float(s))
        return sorted(best.values(), key=lambda h: h.score, reverse=True)[:k]


def select_store(database_url: str) -> VectorStore:
    return PgVectorStore() if database_url.startswith("postgresql") else MemoryStore()
