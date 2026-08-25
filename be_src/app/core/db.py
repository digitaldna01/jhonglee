"""Database access — SQLAlchemy 2.0 async, SQLite by default.

The engine is created lazily on first use, so features that never touch
the DB (chat, demos) cost nothing, and the app boots without a database
at all. Switching to Postgres is a DATABASE_URL change. Models live in
each feature package (e.g. social/models.py) and register on `Base`;
schema migrations arrive with Alembic when the first model lands.

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


def get_engine():
    global _engine, _sessionmaker
    if _engine is None:
        url = get_settings().database_url
        if url.startswith("sqlite"):
            # make sure the file's directory exists (./data by default)
            path = url.split("///", 1)[-1]
            if path and path != ":memory:":
                Path(path).parent.mkdir(parents=True, exist_ok=True)
        _engine = create_async_engine(url, future=True)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def get_session() -> AsyncIterator[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    async with _sessionmaker() as session:
        yield session


async def dispose() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None
