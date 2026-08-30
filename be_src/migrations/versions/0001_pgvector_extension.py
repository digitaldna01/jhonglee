"""enable pgvector extension

Revision ID: 0001
Revises:
Create Date: 2026-08-29
"""
from __future__ import annotations

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Postgres only; on SQLite (local dev without Docker) this is a no-op so
    # the same migration chain runs everywhere.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP EXTENSION IF EXISTS vector")
