# be_src — jhonglee portfolio backend

FastAPI service behind nginx at `/api/*`: content API, the landing RAG chat
(SSE), and interactive demo APIs. Postgres + pgvector for persistence and
vectors, Redis for ephemeral state, Alembic for schema. Runs on a Raspberry
Pi (arm64) via `../docker-compose.yml`.

Design rules and decisions live in `../docs/backend-architecture.md`;
retrieval design in `../docs/rag-design-notes.md`. Keep both current.

## Layout (package-by-feature)

```
app/
  main.py                 create_app(): mounts every feature router under /api
  core/                   domain-free infrastructure
    config.py             env → Settings (every knob is documented in its docstring)
    db.py                 SQLAlchemy async engine (Postgres; SQLite fallback), session_factory
    cache.py              KVCache protocol — MemoryCache | RedisCache (REDIS_URL)
    ratelimit.py          fixed-window RateLimiter on top of the cache
    auth.py               Principal — Visitor (anonymous cookie) | Owner (Visitor + OWNER_TOKEN cookie); get_principal
    lifespan.py           startup: retrieval.warmup() / shutdown: cache + db
  content/                corpus.json loader + /api/content/* (read-only; the corpus source)
  auth/                   /api/auth/owner — the owner's login (rate-limited token check → jhl_owner cookie)
  chat/                   /api/chat/* — the RAG pipeline
    router.py             HTTP only (SSE serialisation)
    service.py            retrieve → context → generate, as (event, payload) async events
    retrieval/            package: __init__ (warmup, edges, retrieve) · hybrid (dense + keyword + follow-up anchor, score fusion) · edges (graph)
    embedding.py          fastembed loader + custom (non-catalog) model registry; run directly by the Dockerfile
    store.py              VectorStore: PgVectorStore (pgvector + tsvector) | MemoryStore (numpy + BM25 fallback); shared tokeniser
    ingest.py             corpus → chunk plan (content hash) → embed only what changed
    models.py             rag_documents, rag_chunks (vector(384) HNSW + generated tsvector GIN), chat_sessions, chat_logs
    generation.py         Claude streaming (AsyncAnthropic) + extractive fallback
    prompts.py            system prompt + context assembly
    history.py            the model's working memory in the cache (Redis): last 8 exchanges + last_sources; rebuilt from chat_logs on a miss
    chatlog.py            best-effort wrapper around conversation.service.record (chat_logs has one writer)
    conversation/         a conversation as an address — /api/chat/sessions/*
      domain.py           Conversation · Turn · Source (frozen values)
      repository.py       ConversationRepository protocol: SqlConversationRepository (chat_sessions + chat_logs) | Memory…
      policy.py           the access table: read = anyone with the id · continue = the visitor who started it · list all = owner
      service.py          ConversationService: begin (claim/verify before answering) · view · mine · all · working_memory
      schemas.py / router.py
  demos/kmeans/           stateless demo API
migrations/               Alembic; env.py reads DATABASE_URL. 0001 pgvector ext, 0002 rag tables, 0003 chat_logs, 0004 rag_chunks.tsv, 0005 chat_logs tokens, 0006 chat_sessions (+ backfill)
docker-entrypoint.sh      `alembic upgrade head`, then uvicorn
tests/                    smoke (TestClient), cache, ingest, chat state (incl. global cap), conversation (policy · service · SQL · HTTP · owner),
                          follow-up, hybrid, mine_golden, usage_report
                          (+ Postgres tests via TEST_DATABASE_URL)
scripts/eval_retrieval.py golden-set retrieval eval (recall@1/@4 EN+KO, two-turn follow-ups, timing, peak RSS); `--sweep` ranking
                          constants, `--pg` the Postgres path — run before changing model/chunking/fusion weights
scripts/mine_golden.py    chat_logs → golden_candidates.json (real questions + what retrieval returned, flags, session
                          follow-ups); label `expect`, then `--merge` into golden_set.json. `--out -` for the Pi
scripts/usage_report.py   chat_logs → per-day questions / answered / tokens / USD at list price, 30-day projection
scripts/eval_retrieval.py --rewrite  adds a "hybrid + rewrite" row: the production query rewrite (Korean / referring
                          follow-ups → English question) before ranking; needs ANTHROPIC_API_KEY, ~$0.01
scripts/judge_answers.py  answer-quality A/B: two system prompts ("current" = prompts.SYSTEM_PROMPT, "v1" = the one it
                          replaced), same retrieval, Sonnet 5 judge (faithfulness per claim + pairwise rubric verdict
                          with shuffled order); scripts/eval_questions.json is the 27-question set, ~$0.55 a run
```

When a module outgrows one file, turn it into a package of the same name
(`retrieval.py` → `retrieval/{__init__,hybrid,edges}.py`, done 2026-08-29) so imports stay
`from .retrieval import retrieve` — see rule 6 in the architecture doc.

## Run

Full stack with hot reload (recommended — Postgres + Redis included):
```bash
docker compose -f ../docker-compose.dev.yml up --build     # http://localhost:5173
docker compose -f ../docker-compose.dev.yml restart backend # after adding a migration
docker compose -f ../docker-compose.dev.yml exec backend python -m app.chat.ingest  # manual index sync
```

Without Docker (SQLite + in-memory cache + numpy vector store — same code paths, no services):
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000   # http://localhost:8000/docs
pytest                                      # add TEST_DATABASE_URL=postgresql+asyncpg://... to run the pgvector test
```

## Environment

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/app.db` | Postgres in compose: `postgresql+asyncpg://jhonglee:<pw>@db:5432/jhonglee` |
| `REDIS_URL` | *(unset → in-memory)* | compose: `redis://redis:6379/0` |
| `ANTHROPIC_API_KEY` | *(unset → extractive answers)* | |
| `CHAT_MODEL` | `claude-haiku-4-5` | |
| `CHAT_RATE_PER_MINUTE` / `CHAT_RATE_PER_DAY` | `10` / `100` | per visitor **and** per IP on `POST /api/chat/stream`; `0` disables a window |
| `CHAT_RATE_GLOBAL_PER_DAY` | `500` | site-wide daily cap = the hard ceiling on the Claude bill (500 × ≈$0.003 ≈ $1.5/day). 429 carries `X-RateLimit-Scope: global` |
| `CHAT_HISTORY_TTL_DAYS` | `7` | working-memory lifetime in the cache; the transcript itself stays in `chat_logs` |
| `OWNER_TOKEN` | *(unset → owner login disabled)* | long random secret; `POST /api/auth/owner {token}` makes that browser the owner (lists/reads every conversation) |
| `EMBED_MODEL` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2-q8` | fastembed catalog name or a `chat/embedding.CUSTOM` key; the Dockerfile `ARG` bakes the same default. 384-d is baked into `rag_chunks.embedding` |

## API surface

```
GET  /api/health
GET  /api/content/posts            GET  /api/content/posts/{slug}
GET  /api/chat/graph[?z=0.5&k=2]   POST /api/chat/stream   (SSE: sources{sources[{id, kind, title, score, url|null}], search_query?: rewritten query | NO_RETRIEVAL} → delta* → done{model, session_id}; 429 + Retry-After when
     z = edge σ floor, k = mutual-kNN size (0 = off)          rate-limited; 403 when session_id is another visitor's conversation)
GET  /api/chat/sessions/{sid}      the transcript — anyone with the id; can_continue only for the visitor who started it
GET  /api/chat/sessions?scope=mine|all[&before=&limit=]   mine: this browser's; all: owner only (403)
POST /api/auth/owner {token}       DELETE /api/auth/owner   GET /api/auth/me   (owner login: 401 wrong, 404 not configured, 429 5/min per IP)
GET  /api/kmeans/dataset           POST /api/kmeans/run
```

## Adding a feature

1. `app/<feature>/{router,service,schemas}.py`; DB models in `app/<feature>/models.py`,
   imported in `migrations/env.py`, then `alembic revision --autogenerate -m "..."`.
2. `app/main.py`: `app.include_router(<feature>_router, prefix="/api")`.
3. One smoke test in `tests/`.
4. Cross-feature calls go through the other feature's `service.py` only.
