"""App settings, env-driven.

CORS origins matter only for local cross-port dev (Vite on :5173/:4173 calling
the backend on :8000). In production the frontend is same-origin via the nginx
`/api` proxy, so no CORS is involved there.

Chat settings:
  ANTHROPIC_API_KEY  — enables real generation; without it the chat API still
                       works but answers extractively from retrieval only.
  CHAT_MODEL         — Anthropic model id for answer generation.
  EMBED_MODEL        — fastembed model for retrieval (must match the model
                       pre-downloaded in the Docker image).
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

        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.chat_model = os.getenv("CHAT_MODEL", "claude-haiku-4-5")
        self.embed_model = os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")


@lru_cache
def get_settings() -> Settings:
    return Settings()
