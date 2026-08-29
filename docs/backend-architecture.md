# 백엔드 아키텍처 — 뼈대와 원칙

> be_src(FastAPI)의 구조 결정 기록. 기능을 추가하거나 저장소를 붙일 때 이 문서의 규칙을 따른다.
> 마지막 업데이트: 2026-08-29

## 결정 (2026-08)

| 항목        | 결정                                               | 이유                                                                                               |
| ----------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 구조        | **기능별 패키지** (package-by-feature)             | 기능 하나 고칠 때 폴더 하나만 열도록. 레이어별(routers/schemas/ml) 구조는 기능 5개부터 흩어짐      |
| DB          | **Postgres + pgvector** (SQLAlchemy 2.0 async, asyncpg), 스키마는 Alembic | 2026-08-29 SQLite에서 전환. 영속 데이터와 벡터를 한 DB에 — 하이브리드 검색을 SQL로, 백업 하나(pg_dump), 컨테이너 하나만 추가. `DATABASE_URL` 미설정 시 SQLite로 폴백(Docker 없는 로컬 개발) |
| 캐시/세션   | **`core/cache.py` 인터페이스**, 구현 memory \| **Redis** | 2026-08-29 RedisCache 구현·compose 추가. `REDIS_URL` 하나로 선택. 챗 세션·레이트리밋·시맨틱 캐시의 자리 |
| 벡터 저장   | **pgvector** (별도 벡터 DB 없음)                    | 사이트 규모에서 Qdrant급 스케일은 불필요, 운영 표면 최소화. retrieval.py의 저장소 부분만 교체하면 나중에 전용 벡터 DB로 이전 가능 |
| 정체성      | **익명 visitor 쿠키** (`core/deps.py`), OAuth 없음 | 좋아요 중복 방지·댓글 귀속에 충분. 세부(닉네임 등)는 social 구현 때 결정                           |
| 챗 히스토리 | **서버 저장 예정** — Redis, TTL 7일                | `chat/history.py`에 설계만 기록. 켜기 전까지 클라이언트가 히스토리를 보냄                          |

## 레이아웃

```
be_src/app/
  main.py               create_app(): 기능 라우터 마운트 + lifespan
  core/                 도메인 없는 인프라
    config.py           환경변수 → Settings (모든 knob의 목록이 docstring에)
    lifespan.py         시작: 임베딩 warmup / 종료: cache close, DB dispose
    db.py               async 엔진(지연 생성) + get_session Depends + Base
    cache.py            KVCache 프로토콜 (get/set/delete/incr/close + ttl) — MemoryCache | RedisCache
    deps.py             get_visitor_id (익명 쿠키 jhl_vid)
  content/              축 ②: "내가 만든 것" — 읽기 전용, corpus.json이 소스 (chat이 빌려 씀)
    repository.py       corpus.json 로더 (DOCS / NODES / BIO / by_id)
    service.py          list_posts · get · exists · nodes  ← 타 기능은 여기만 호출
    router.py           GET /api/content/posts, /posts/{slug}
  chat/                 축 ①: 랜딩 RAG  (content에 의존, 역방향 없음)
    router.py           HTTP만: /graph, /stream(SSE 직렬화)
    service.py          retrieve → context → generate 오케스트레이션, (event, payload) 이벤트 생성
    retrieval.py        모델 로드·warmup(인덱스 sync + 엣지)·retrieve() — 저장소는 store.py에 위임
    store.py            VectorStore 인터페이스: PgVectorStore(pgvector) | MemoryStore(numpy, SQLite 폴백)
    ingest.py           corpus.json → 청크 계획(해시) → 바뀐 것만 임베딩·삽입, 사라진 것 삭제. `python -m app.chat.ingest`
    models.py           rag_documents · rag_chunks (vector(384), HNSW) — corpus.json의 파생 인덱스
    generation.py       Claude 스트리밍(AsyncAnthropic) + 추출식 폴백 — (event, payload) async 제너레이터
    prompts.py          시스템 프롬프트·컨텍스트 조립 — 톤 수정은 여기서
    history.py          서버 세션 설계 (구현 예정)
    schemas.py
  demos/kmeans/         축 ②: 인터랙티브 데모 API (router · service · schemas)
  social/               축 ③ (예정): 좋아요·댓글·챗 히스토리 — __init__ docstring에 계획
tests/                  TestClient 스모크 (기능별 1개 이상)
be_src/migrations/      Alembic (env.py는 DATABASE_URL을 읽음; 0001 = pgvector 확장, 0002 = rag_* 테이블 + HNSW)
be_src/docker-entrypoint.sh  `alembic upgrade head` 후 uvicorn — 컨테이너 시작마다 스키마 동기화
```

## 규칙

1. **라우터는 HTTP만.** 파싱·응답 형태·상태코드·SSE 직렬화. 로직은 `service.py`.
   서비스는 전송을 모른다 — `chat.service.answer()`는 `(event, payload)` 튜플을 내는
   **async 제너레이터**이고 라우터가 SSE 문자열로 바꾼다. 챗 경로는 DB 조회(asyncpg)와
   Anthropic 스트리밍이 모두 async라 끝까지 async; CPU 작업(임베딩)만 `asyncio.to_thread`.
2. **저장소는 인터페이스 뒤에.** 휘발 상태는 `core.cache.get_cache()`, 영속은 `core.db.get_session`.
   클라이언트 라이브러리(redis, sqlite)를 기능 코드가 직접 import하지 않는다.
   구현 선택은 환경변수(`REDIS_URL`, `DATABASE_URL`) 하나로.
3. **기능 간 의존은 service 함수로만.** social이 slug를 검증하면 `content.service.exists()`.
   다른 기능의 repository/내부 모듈 import 금지.
4. **상태는 종류별로 자리가 정해져 있다.**

   | 상태                              | 수명      | 자리                                 |
   | --------------------------------- | --------- | ------------------------------------ |
   | 파생 콘텐츠 (corpus.json)         | 배포 단위 | 파일 → 메모리 (`content.repository`) |
   | ML 런타임 (임베딩 모델)           | 프로세스  | 메모리, lifespan warmup              |
   | 세션/휘발 (챗 히스토리, 카운터)   | TTL       | `core.cache`                         |
   | 영속 사용자 데이터 (좋아요, 댓글) | 영구      | `core.db` (Postgres)                 |
   | 청크 벡터 (corpus.json의 인덱스)   | 콘텐츠 해시 | `rag_chunks.embedding` (pgvector) — 시작 시 증분 sync |

5. **새 기능 추가 절차.** `app/<feature>/{router,service,schemas}.py` 생성 → `main.py`에
   `include_router(..., prefix="/api")` 한 줄 → `tests/`에 스모크 1개.
   DB 모델은 `app/<feature>/models.py`에 두고 `migrations/env.py`에서 import →
   `alembic revision --autogenerate -m "..."`. 마이그레이션은 Postgres/SQLite 양쪽에서
   돌아야 한다 (Postgres 전용 SQL은 `dialect.name` 분기).

6. **모듈이 커지면 같은 이름의 패키지로.** 한 파일이 길어지거나 나눠야 할 때 새 이름을 만들지 말고
   `retrieval.py` → `retrieval/` 폴더로 승격해 하위 모듈로 쪼갠다. `__init__.py`가 기존 공개 함수를
   re-export하므로 호출부 import(`from .retrieval import retrieve`)는 그대로.

   ```
   chat/retrieval.py            →   chat/retrieval/__init__.py   (retrieve, warmup, edges re-export)
                                    chat/retrieval/dense.py      (pgvector 검색)
                                    chat/retrieval/hybrid.py     (BM25 + RRF)
                                    chat/retrieval/edges.py      (그래프 엣지)
   chat/models.py               →   chat/models/__init__.py, models/rag.py, models/log.py
   ```
   기준: 파일이 ~300줄을 넘거나, 서로 다른 이유로 바뀌는 코드가 한 파일에 섞이기 시작할 때.

## API 표면

```
GET  /api/health
GET  /api/content/posts              GET /api/content/posts/{slug}
GET  /api/chat/graph                 POST /api/chat/stream (SSE)
GET  /api/kmeans/dataset             POST /api/kmeans/run
--- planned ---
POST /api/social/posts/{slug}/likes  GET/POST /api/social/posts/{slug}/comments
```

## 배포 메모

- `docker-compose.yml` (Pi): `backend` + `db`(`pgvector/pgvector:pg17`, arm64) + `redis`(`redis:7-alpine`).
  backend는 두 서비스의 healthcheck를 기다린 뒤 시작. 볼륨: `db-data`, `redis-data`
- **프로덕션 시크릿은 GitHub Actions Secrets** (`ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD`) — deploy.yml이 매 배포마다
  `.env`를 새로 씀. Pi에 직접 둔 `.env`는 `actions/checkout`의 `git clean -ffdx`에 지워지므로 소용없음
  (2026-08-29 확인: 프로덕션 backend에 ANTHROPIC_API_KEY가 비어 있었음). `POSTGRES_PASSWORD`는 첫 배포 후 **변경 금지**
  (DB 볼륨이 초기 비밀번호를 보존). 로컬 템플릿은 루트 `.env.example`
- **Pi는 2GB** (Pi 4 B Rev 1.5, `free -h` 1.8Gi; 2026-08-29 확인). 2026-08-29에 다음을 적용함:
  - 메모리 cgroup 활성화 (`/boot/firmware/cmdline.txt`에 `cgroup_enable=cpuset cgroup_enable=memory cgroup_memory=1`) —
    이게 없으면 `docker stats`가 0B이고 compose `mem_limit`도 무시됨
  - 스왑 200MB → **1GB** (`/etc/dphys-swapfile` `CONF_SWAPSIZE=1024`)
  - 데스크톱 종료: `systemctl set-default multi-user.target` (GUI가 ~260MB를 먹고 있었음)
  - 결과: OS + dockerd + Actions 러너 기본 사용량 **~250MB**. 새 스택 예산 ≈ backend 0.7GB + Postgres/Redis/nginx 0.15GB → ~1.2GB/1.8GB
  - **VS Code Remote-SSH를 Pi에 붙이면 +~420MB** (node 서버 4개). 배포 중엔 끊을 것; 평소엔 터미널 ssh 권장
  - compose `mem_limit`: backend 1100m · postgres 256m · redis 96m · web 64m
  - 네트워크: Wi-Fi 5GHz(`KT_GiGA_5G_F48D`, ch149), IP 172.30.1.5 (공유기가 공인 IP:22022 → 이 주소로 포트포워딩하므로 사실상 고정,
    MAC d8:3a:dd:27:c7:04). 맥 `~/.ssh/config`: `ssh raspberrypi`(LAN) / `ssh rpi-external`(외부, 키 인증)
  - **Wi-Fi 프로필 우선순위**: 2026-08-29 재부팅 장애의 원인은 `KT_GiGA_5G_MAX`(다른 AP, 다른 서브넷) 프로필이
    autoconnect-priority 100으로 메인 공유기(`KT_GiGA_5G_F48D`)보다 높았던 것. F48D를 200으로, MAX를 0으로 둘 것
    (`nmcli connection modify "<name>" connection.autoconnect-priority N`)
  - **SSH**: 공인 IP:22022가 인터넷에 포워딩돼 7일간 실패 로그인 13.8만 건 관측 → 2026-08-29 **키 전용으로 전환**
    (`/etc/ssh/sshd_config.d/50-keys-only.conf`: PasswordAuthentication no, PermitRootLogin no, MaxAuthTries 3).
    새 기기는 `ssh-copy-id`로 키 등록 필요. 같은 날 fail2ban(backend=systemd — Bookworm엔 auth.log 없음) 설치,
    **Tailscale** 도입 후 공유기의 SSH 포워딩(22022·2222) 삭제 → 인터넷에 열린 건 80/443(웹, Cloudflare 경유)뿐.
    외부 접속은 `ssh rpi-external`(Tailscale 주소, 집 안팎 동일)
  - **헤드리스 복구 절차** (재부팅 후 Wi-Fi가 안 붙어 SSH 불가였던 사례): Bookworm은 `wpa_supplicant.conf`를 bootfs에 넣는
    옛 방식이 안 통함. 대신 bootfs에 `firstrun.sh`(nmcli/imager_custom으로 Wi-Fi 등록 후 스스로 삭제)를 두고
    `cmdline.txt` 끝에 `systemd.run=/boot/firmware/firstrun.sh systemd.run_success_action=reboot systemd.unit=kernel-command-line.target`
    을 붙이면 첫 부팅에서 한 번 실행됨. macOS는 bootfs(FAT)만 마운트 가능, rootfs(ext4)는 못 읽음
  - Postgres `shared_buffers=32MB`·`max_connections=10`, Redis `maxmemory 48mb`
  - backend ~0.6–0.8GB(onnxruntime + bge-small 65MB)가 최대 소비자. **225MB급 다국어 임베딩 모델(+560MB)은 이 Pi에 불가** →
    한국어 대응은 질문 재작성(Haiku 번역, 메모리 0) 또는 양자화 모델로 (rag-design-notes §임베딩 모델)
- 스키마: 컨테이너 entrypoint가 `alembic upgrade head` 실행 → 배포 = 마이그레이션 자동 적용
- RAG 인덱스: 시작 시 `retrieval.warmup()`이 corpus.json과 `rag_chunks`를 해시로 대조해 바뀐 청크만 임베딩
  (첫 부팅 30청크 2.6s, 이후 0.0s). 임베딩 모델을 바꾸면 해시가 전부 달라져 자동 재임베딩 — 단 차원이
  바뀌면(384→1024) `vector(N)` 컬럼·HNSW 인덱스 마이그레이션이 먼저 필요
- 로컬: `docker-compose.local.yml`(프로덕션 동형, Postgres 5433·Redis 6380 노출) / `docker-compose.dev.yml`(핫 리로드).
  Docker 없이 `pytest`·uvicorn만 돌리면 SQLite + MemoryCache로 폴백
- 2026-08-29 이전의 `backend-data` 볼륨(SQLite)은 더 이상 마운트하지 않음 — 데이터 없었음(social 미구현)
