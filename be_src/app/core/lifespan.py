"""Process lifecycle: warm what must be ready before traffic, release on exit."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

from ..chat import retrieval
from . import db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # embedding model + corpus vectors: ~seconds on a Pi, do it once up front
    await run_in_threadpool(retrieval.warmup)
    yield
    await db.dispose()
