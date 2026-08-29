"""chat_logs.input_tokens / output_tokens — what each answer cost

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:  # plain types: Postgres and the SQLite fallback alike
    op.add_column("chat_logs", sa.Column("input_tokens", sa.Integer, nullable=True))
    op.add_column("chat_logs", sa.Column("output_tokens", sa.Integer, nullable=True))


def downgrade() -> None:
    op.drop_column("chat_logs", "output_tokens")
    op.drop_column("chat_logs", "input_tokens")
