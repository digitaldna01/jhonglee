"""FastAPI entrypoint for the jhonglee portfolio backend.

All features are mounted under `/api/<feature>`. To add a new feature (e.g. a
comments API), create `app/routers/<feature>.py` with an `APIRouter` and
register it below with `app.include_router(..., prefix="/api")`.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import get_settings
from .routers import kmeans

settings = get_settings()

app = FastAPI(title="jhonglee backend", version="0.1.0")

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
