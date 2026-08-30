"""FastAPI entrypoint for the jhonglee portfolio backend.

Package-by-feature: each feature under `app/` owns its router, schemas
and logic (`content/`, `chat/`, `auth/`, `demos/<name>/`, `social/`); `core/`
holds domain-free infrastructure (settings, db, cache, deps, lifespan).
Every feature mounts under `/api/<feature>`. To add one, create the
package with a `router.py` exposing `router` and register it below.
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth.router import router as auth_router
from .chat.router import router as chat_router
from .content.router import router as content_router
from .core.config import get_settings
from .core.lifespan import lifespan
from .demos.kmeans.router import router as kmeans_router


def create_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s: %(message)s")
    settings = get_settings()
    app = FastAPI(title="jhonglee backend", version="0.2.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,  # anonymous visitor cookie
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Retry-After", "X-RateLimit-Scope"],  # the 429 details, readable cross-origin (Vite dev)
    )

    @app.get("/api/health", tags=["meta"])
    def health():
        return {"status": "ok"}

    app.include_router(content_router, prefix="/api")  # /api/content/*
    app.include_router(chat_router, prefix="/api")     # /api/chat/*
    app.include_router(auth_router, prefix="/api")     # /api/auth/*
    app.include_router(kmeans_router, prefix="/api")   # /api/kmeans/*
    return app


app = create_app()
