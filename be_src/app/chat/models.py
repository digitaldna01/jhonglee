"""RAG index tables — the vector store when DATABASE_URL is Postgres.

corpus.json stays the source of truth; these tables are a derived index
of it (what the in-memory numpy matrix used to be), kept in sync by
`chat/ingest.py` on every startup or `python -m app.chat.ingest`.

  rag_documents  one row per corpus doc (metadata for filters/joins)
  rag_chunks     one row per embedded passage; the primary key embeds the
                 content hash, so a changed chunk is a new row and the old
                 one is deleted — no in-place updates, no stale vectors.
                 `tsv` is a generated full-text column over the passage
                 (english config: stopwords + stemming, Hangul passes
                 through untouched) for the keyword half of hybrid search
  chat_logs      one row per answered question: what was asked, what was
                 retrieved (ids + scores), what was answered, by which
                 model, how fast, and how many tokens it cost (NULL for
                 extractive fallbacks). The raw material for growing the
                 golden set, judging retrieval after the fact and the cost
                 report (scripts/usage_report.py). Append-only.

EMBED_DIM must match the embedding model (bge-small: 384). Changing to a
model with another dimension needs a migration that alters the column
and rebuilds the HNSW index; the ingest hash then re-embeds everything.
"""
from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Boolean, Computed, DateTime, Float, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from ..core.db import Base

EMBED_DIM = 384
FTS_CONFIG = "english"  # text-search config for rag_chunks.tsv — keep in step with migration 0004


class RagDocument(Base):
    __tablename__ = "rag_documents"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    kind: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    node: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RagChunk(Base):
    __tablename__ = "rag_chunks"

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # "{doc_id}#{hash[:12]}"
    doc_id: Mapped[str] = mapped_column(
        Text, ForeignKey("rag_documents.id", ondelete="CASCADE"), index=True
    )
    heading: Mapped[str | None] = mapped_column(Text, nullable=True)
    text: Mapped[str] = mapped_column(Text)
    passage: Mapped[str] = mapped_column(Text)  # what was actually embedded
    hash: Mapped[str] = mapped_column(Text)  # sha256(model + passage)
    is_summary: Mapped[bool] = mapped_column(Boolean, default=False)
    model: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBED_DIM))
    tsv = mapped_column(  # keyword index, maintained by Postgres (see FTS_CONFIG)
        TSVECTOR, Computed(f"to_tsvector('{FTS_CONFIG}', passage)", persisted=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ChatLog(Base):
    __tablename__ = "chat_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    visitor_id: Mapped[str] = mapped_column(Text, index=True)
    session_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    question: Mapped[str] = mapped_column(Text)
    sources: Mapped[list] = mapped_column(JSON)  # [{id, kind, title, score}] as sent to the client
    answer: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    retrieval_ms: Mapped[float] = mapped_column(Float)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)  # model usage; None = fallback
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
