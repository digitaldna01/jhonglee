"""Process lifecycle: warm what must be ready before traffic, release on exit."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from ..chat import retrieval
from . import db
from .cache import close_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    # embedding model + incremental index sync: do it once before traffic
    await retrieval.warmup()
    yield
    await close_cache()
    await db.dispose()
