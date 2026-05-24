"""App settings, env-driven.

CORS origins matter only for local cross-port dev (Vite on :5173/:4173 calling
the backend on :8000). In production the frontend is same-origin via the nginx
`/api` proxy, so no CORS is involved there.
"""
import os
from functools import lru_cache


class Settings:
    def __init__(self) -> None:
        raw = os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://localhost:4173",
        )
        self.cors_origins = [o.strip() for o in raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
