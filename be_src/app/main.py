"""FastAPI entrypoint for the jhonglee portfolio backend.

All features are mounted under `/api/<feature>`. To add a new feature (e.g. a
comments API), create `app/routers/<feature>.py` with an `APIRouter` and
register it below with `app.include_router(..., prefix="/api")`.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from contextlib import asynccontextmanager

from starlette.concurrency import run_in_threadpool

from .core.config import get_settings
from .ml import retrieval
from .routers import chat, kmeans

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # load the embedding model + corpus vectors before serving traffic
    await run_in_threadpool(retrieval.warmup)
    yield


app = FastAPI(title="jhonglee backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


# Feature routers — add new ones here as the portfolio backend grows.
app.include_router(kmeans.router, prefix="/api")  # -> /api/kmeans/*
app.include_router(chat.router, prefix="/api")  # -> /api/chat/*
