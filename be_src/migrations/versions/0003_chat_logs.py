"""chat_logs — answered-question log

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:  # plain types: runs on Postgres and the SQLite fallback alike
    op.create_table(
        "chat_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("visitor_id", sa.Text, nullable=False),
        sa.Column("session_id", sa.Text, nullable=True),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("sources", sa.JSON, nullable=False),
        sa.Column("answer", sa.Text, nullable=False),
        sa.Column("model", sa.Text, nullable=False),
        sa.Column("retrieval_ms", sa.Float, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_chat_logs_visitor_id", "chat_logs", ["visitor_id"])
    op.create_index("ix_chat_logs_created_at", "chat_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("chat_logs")
