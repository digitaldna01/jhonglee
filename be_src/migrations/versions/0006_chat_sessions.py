"""chat_sessions — a conversation as an address (/chat/{id})

One row per session_id the client has used: who started it, first and
last activity. Existing chat_logs are backfilled so every past conversation
already has a page; chat_logs.session_id gets the index the transcript
lookups need.

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:  # plain SQL types and a portable backfill: Postgres and SQLite alike
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("visitor_id", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_chat_sessions_visitor_id", "chat_sessions", ["visitor_id"])
    op.create_index("ix_chat_sessions_last_at", "chat_sessions", ["last_at"])
    op.create_index("ix_chat_logs_session_id", "chat_logs", ["session_id"])
    op.execute(
        """
        INSERT INTO chat_sessions (id, visitor_id, created_at, last_at)
        SELECT session_id, MIN(visitor_id), MIN(created_at), MAX(created_at)
        FROM chat_logs
        WHERE session_id IS NOT NULL
        GROUP BY session_id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_chat_logs_session_id", table_name="chat_logs")
    op.drop_index("ix_chat_sessions_last_at", table_name="chat_sessions")
    op.drop_index("ix_chat_sessions_visitor_id", table_name="chat_sessions")
    op.drop_table("chat_sessions")
