"""rag index tables (documents, chunks + pgvector embedding, HNSW index)

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

EMBED_DIM = 384  # BAAI/bge-small-en-v1.5 — keep in step with app/chat/models.py


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return  # SQLite fallback uses the in-memory store; no tables needed

    op.create_table(
        "rag_documents",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("tags", sa.JSON, nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("url", sa.Text, nullable=True),
        sa.Column("node", sa.Boolean, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "rag_chunks",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("doc_id", sa.Text, sa.ForeignKey("rag_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("heading", sa.Text, nullable=True),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("passage", sa.Text, nullable=False),
        sa.Column("hash", sa.Text, nullable=False),
        sa.Column("is_summary", sa.Boolean, nullable=False),
        sa.Column("model", sa.Text, nullable=False),
        sa.Column("embedding", Vector(EMBED_DIM), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_rag_chunks_doc_id", "rag_chunks", ["doc_id"])
    # ANN index for cosine search (ORDER BY embedding <=> q). Overkill for a
    # few dozen rows, but it is what production pgvector looks like.
    op.execute(
        "CREATE INDEX ix_rag_chunks_embedding ON rag_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.drop_table("rag_chunks")
    op.drop_table("rag_documents")
