"""App settings, env-driven. One place for every knob.

  CORS_ORIGINS        comma-separated; only matters for cross-port local dev
                      (prod is same-origin behind the nginx /api proxy)
  ANTHROPIC_API_KEY   enables real chat generation; without it the chat API
                      still works but answers extractively from retrieval only
  CHAT_MODEL          Anthropic model id for answer generation
  EMBED_MODEL         fastembed model for retrieval (must match the model
                      pre-downloaded in the Docker image)
  DATABASE_URL        SQLAlchemy async URL; SQLite file by default
  REDIS_URL           when set, the KV cache uses Redis; otherwise in-memory
  CHAT_HISTORY_TTL_DAYS  how long server-side chat sessions live in the cache
"""
import os
from functools import lru_cache


class Settings:
    def __init__(self) -> None:
        raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173")
        self.cors_origins = [o.strip() for o in raw.split(",") if o.strip()]

        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.chat_model = os.getenv("CHAT_MODEL", "claude-haiku-4-5")
        self.embed_model = os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")

        self.database_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/app.db")
        self.redis_url = os.getenv("REDIS_URL", "")
        self.chat_history_ttl_days = int(os.getenv("CHAT_HISTORY_TTL_DAYS", "7"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
