# be_src — jhonglee portfolio backend

A small FastAPI service that powers interactive/dynamic features of the
jhonglee.com portfolio. Served behind nginx at `/api/*` (see `../nginx.conf`),
deployed as its own container (see `../docker-compose.yml`).

## Layout
```
app/
  main.py            FastAPI app; mounts every feature router under /api
  core/config.py     env-driven settings (CORS origins, ...)
  routers/           one module per feature  ──  kmeans.py  (+ future: comments.py …)
  ml/                framework-agnostic algorithms  ──  kmeans.py
  schemas/           pydantic request/response models  ──  kmeans.py
```

## Run locally
```bash
cd be_src
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# http://localhost:8000/docs  (interactive API)
```

The Vite dev server proxies `/api` → `http://localhost:8000` (see `../vite.config.js`).

## Current features
- **KMeans** (`/api/kmeans`): `GET /dataset`, `POST /run` — stateless; returns the
  full sequence of Lloyd's-algorithm steps as JSON for the frontend to animate.

## Adding a feature
1. `app/schemas/<feature>.py` — pydantic models.
2. `app/ml/` or other domain logic as needed (keep it framework-agnostic).
3. `app/routers/<feature>.py` — an `APIRouter(prefix="/<feature>")`.
4. Register it in `app/main.py`: `app.include_router(<feature>.router, prefix="/api")`.
5. If the feature needs persistence (e.g. comments), add a `db/` layer then
   (SQLite on a Pi volume, or Postgres) — not before.
