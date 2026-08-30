"""rag_chunks.tsv — generated full-text column + GIN index (hybrid search)

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import TSVECTOR

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

FTS_CONFIG = "english"  # keep in step with app/chat/models.py


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return  # SQLite fallback uses the in-memory store (BM25 in Python)

    # 'english': stopwords + stemming for the English half of the passages;
    # Hangul tokens pass through as-is (no Korean dictionary), which is fine —
    # the keyword ranking is there for exact tokens (k-means, XGBoost, Blender),
    # dense retrieval carries the Korean questions.
    op.add_column(
        "rag_chunks",
        sa.Column("tsv", TSVECTOR, sa.Computed(f"to_tsvector('{FTS_CONFIG}', passage)", persisted=True)),
    )
    op.create_index("ix_rag_chunks_tsv", "rag_chunks", ["tsv"], postgresql_using="gin")


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.drop_index("ix_rag_chunks_tsv", table_name="rag_chunks")
    op.drop_column("rag_chunks", "tsv")
