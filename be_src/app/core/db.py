"""Database access — SQLAlchemy 2.0 async. Postgres (+pgvector) in
production, SQLite when DATABASE_URL is unset (local dev without Docker).

The engine is created lazily on first use, so features that never touch
the DB (chat, demos) cost nothing, and the app boots without a database
at all. Models live in each feature package (e.g. social/models.py) and
register on `Base`; the schema is managed by Alembic (../migrations),
applied by the container entrypoint before uvicorn starts.

    async def endpoint(session: AsyncSession = Depends(get_session)): ...
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def ensure_sqlite_dir(url: str) -> None:
    """For file-backed SQLite URLs, create the parent directory (./data by default)."""
    if url.startswith("sqlite"):
        path = url.split("///", 1)[-1]
        if path and path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)


def get_engine():
    global _engine, _sessionmaker
    if _engine is None:
        url = get_settings().database_url
        ensure_sqlite_dir(url)
        _engine = create_async_engine(url, future=True)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def session_factory() -> async_sessionmaker[AsyncSession]:
    """For internal callers (stores, startup jobs) that are not FastAPI endpoints."""
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


async def get_session() -> AsyncIterator[AsyncSession]:
    async with session_factory()() as session:
        yield session


async def dispose() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None
