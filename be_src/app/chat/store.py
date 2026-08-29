"""Vector stores — where chunk embeddings live and how they are searched.

Two implementations behind one small interface, chosen by DATABASE_URL:

  PgVectorStore  Postgres + pgvector (production, docker-compose)
  MemoryStore    numpy in-process (SQLite fallback: pytest / uvicorn
                 without Docker). Re-embeds the corpus on every start,
                 exactly what the backend did before pgvector.

Both answer two kinds of query with the same row shape — `search` (dense:
cosine over the chunk vectors) and `keyword_search` (Postgres full-text
`ts_rank_cd` over the generated `tsv` column / an in-process BM25) — and
neither knows about prompts, SSE or corpus.json: ingest feeds them,
retrieval queries and fuses them.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..core.db import session_factory
from .models import FTS_CONFIG, RagChunk, RagDocument


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
    score: float  # cosine similarity (search) or keyword rank score (keyword_search)


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

    async def keyword_search(self, query: str, k: int) -> list[Hit]:
        """Top-k documents by exact-token match, best chunk included. Docs that
        share no term with the query are absent (the list may be short/empty)."""
        ...


# --------------------------------------------------------------------------
# Keyword tokenisation — a close-enough mirror of Postgres' `english` text
# search config so MemoryStore ranks like PgVectorStore: lower-case, hyphen
# compounds kept whole *and* split ("k-means" → k-means, k, means), English
# stopwords dropped, a light suffix stemmer. Hangul passes through as-is,
# but is cut from Latin at the script boundary ("k-means로" → k-means, 로) so
# an English name inside a Korean question still matches.
# --------------------------------------------------------------------------

_WORD = re.compile(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*|[^\W\d_A-Za-z]+")
# Postgres' english.stop list + the verbs/fillers a question about a portfolio
# is made of ("tell me more", "have you used", "did you make anything") —
# they match every post and would let a lone token hit outrank the embedding
STOPWORDS = frozenset(
    """i me my myself we our ours ourselves you your yours yourself yourselves he him his
    himself she her hers herself it its itself they them their theirs themselves what which
    who whom this that these those am is are was were be been being have has had having do
    does did doing a an the and but if or because as until while of at by for with about
    against between into through during before after above below to from up down in out on
    off over under again further then once here there when where why how all any both each
    few more most other some such no nor not only own same so than too very s t can will
    just don should now
    tell show explain describe talk know use used using make made build built create created
    anything something everything ever please thanks thank hi hello one ones thing things
    stuff also really much many lot kind sort like""".split()
)


def words(text: str) -> list[str]:
    """Query words for Postgres (`to_tsquery` stems them itself). A hyphen
    compound is passed whole *and* in parts: Postgres turns "k-means" into the
    phrase k-mean <-> k <-> mean, which a passage saying "KMeans" or "k
    clusters" would never match — the parts give it BM25-like partial credit."""
    out: list[str] = []
    for w in (m.group(0).lower() for m in _WORD.finditer(text)):
        parts = w.split("-")
        out.extend(p for p in ([w, *parts] if len(parts) > 1 else parts) if p and p not in STOPWORDS)
    return out


_VOWELS = "aeiou"


def _stem(w: str) -> str:
    """Porter steps 1a/1b only — enough to agree with snowball on the corpus'
    plurals and -ing/-ed forms (lives/living/live → live, centroids → centroid,
    libraries → librari, clustering → cluster)."""
    if w.endswith("sses"):
        w = w[:-2]
    elif w.endswith("ies"):
        w = w[:-2]
    elif not w.endswith("ss") and w.endswith("s") and len(w) > 3:
        w = w[:-1]
    for suffix in ("ing", "ed"):
        if w.endswith(suffix):
            stem = w[: -len(suffix)]
            if len(stem) >= 2 and any(c in _VOWELS for c in stem):
                w = stem
                if w.endswith(("at", "bl", "iz")):
                    w += "e"
                elif len(w) >= 2 and w[-1] == w[-2] and w[-1] not in "lsz":
                    w = w[:-1]  # hopping → hop
                elif len(w) == 3 and w[0] not in _VOWELS and w[1] in _VOWELS and w[2] not in _VOWELS + "wxy":
                    w += "e"  # liv → live
                elif len(w) == 2 and w[0] in _VOWELS and w[1] not in _VOWELS:
                    w += "e"  # us → use
            break
    return w


def terms(text: str) -> list[str]:
    """BM25 terms (MemoryStore): words plus their hyphen parts, stemmed."""
    return [_stem(w) for w in words(text)]


class _BM25:
    """Okapi BM25 over pre-tokenised passages (rank-bm25 in twenty lines)."""

    K1, B = 1.2, 0.75

    def __init__(self, docs: list[list[str]]) -> None:
        self._tf = [Counter(d) for d in docs]
        self._len = [len(d) for d in docs]
        self._avg = (sum(self._len) / len(docs)) if docs else 1.0
        df: Counter[str] = Counter()
        for d in docs:
            df.update(set(d))
        n = len(docs)
        self._idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}

    def scores(self, query: list[str]) -> list[float]:
        out = []
        for tf, length in zip(self._tf, self._len):
            s = 0.0
            for t in query:
                f = tf.get(t)
                if f:
                    norm = f + self.K1 * (1 - self.B + self.B * length / self._avg)
                    s += self._idf[t] * f * (self.K1 + 1) / norm
            out.append(s)
        return out


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
        return await self._top_docs(best, k)

    async def keyword_search(self, query: str, k: int) -> list[Hit]:
        ws = words(query)
        if not ws:
            return []
        # OR-query: any shared term counts, ts_rank_cd weighs how many/how close
        tsq = func.to_tsquery(FTS_CONFIG, " | ".join(ws))
        rank = func.ts_rank_cd(RagChunk.tsv, tsq)
        best = (
            select(
                RagChunk.doc_id,
                RagChunk.heading,
                RagChunk.text,
                RagChunk.is_summary,
                rank.label("score"),
            )
            .where(RagChunk.tsv.op("@@")(tsq))
            .distinct(RagChunk.doc_id)
            .order_by(RagChunk.doc_id, rank.desc())
            .subquery()
        )
        return await self._top_docs(best, k)

    @staticmethod
    async def _top_docs(best, k: int) -> list[Hit]:
        stmt = select(best).order_by(best.c.score.desc()).limit(k)
        async with session_factory()() as s:
            rows = await s.execute(stmt)
            return [
                Hit(doc_id=r.doc_id, heading=r.heading, text=r.text, is_summary=r.is_summary, score=float(r.score))
                for r in rows
            ]


# --------------------------------------------------------------------------
# In-process numpy + BM25 (fallback)
# --------------------------------------------------------------------------


class MemoryStore:
    def __init__(self) -> None:
        self._chunks: dict[str, tuple[ChunkRow, np.ndarray]] = {}
        self._bm25: tuple[list[ChunkRow], _BM25] | None = None  # rebuilt lazily after apply()

    async def existing_chunk_ids(self) -> set[str]:
        return set(self._chunks)

    async def apply(self, docs, new_chunks, stale_chunk_ids) -> None:
        doc_ids = {d["id"] for d in docs}
        for cid in list(self._chunks):
            if cid in stale_chunk_ids or self._chunks[cid][0].doc_id not in doc_ids:
                del self._chunks[cid]
        for row, vec in new_chunks:
            self._chunks[row.id] = (row, np.asarray(vec, dtype=np.float32))
        self._bm25 = None

    async def summary_vectors(self) -> dict[str, np.ndarray]:
        return {row.doc_id: vec for row, vec in self._chunks.values() if row.is_summary}

    async def search(self, qvec: np.ndarray, k: int) -> list[Hit]:
        if not self._chunks:
            return []
        rows = list(self._chunks.values())
        mat = np.stack([vec for _, vec in rows])
        norms = np.linalg.norm(mat, axis=1) * (np.linalg.norm(qvec) or 1.0)
        scores = mat @ qvec / np.where(norms == 0, 1.0, norms)
        return self._best_per_doc((row for row, _ in rows), scores, k)

    async def keyword_search(self, query: str, k: int) -> list[Hit]:
        q = terms(query)
        if not q or not self._chunks:
            return []
        if self._bm25 is None:
            rows = [row for row, _ in self._chunks.values()]
            self._bm25 = (rows, _BM25([terms(r.passage) for r in rows]))
        rows, index = self._bm25
        return self._best_per_doc(rows, index.scores(q), k, positive_only=True)

    @staticmethod
    def _best_per_doc(rows, scores, k: int, *, positive_only: bool = False) -> list[Hit]:
        best: dict[str, Hit] = {}
        for row, s in zip(rows, scores):
            if positive_only and s <= 0:
                continue
            cur = best.get(row.doc_id)
            if cur is None or s > cur.score:
                best[row.doc_id] = Hit(row.doc_id, row.heading, row.text, row.is_summary, float(s))
        return sorted(best.values(), key=lambda h: h.score, reverse=True)[:k]


def select_store(database_url: str) -> VectorStore:
    return PgVectorStore() if database_url.startswith("postgresql") else MemoryStore()
