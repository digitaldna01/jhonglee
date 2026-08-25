# 백엔드 아키텍처 — 뼈대와 원칙

> be_src(FastAPI)의 구조 결정 기록. 기능을 추가하거나 저장소를 붙일 때 이 문서의 규칙을 따른다.
> 마지막 업데이트: 2026-08-23

## 결정 (2026-08)

| 항목        | 결정                                               | 이유                                                                                               |
| ----------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 구조        | **기능별 패키지** (package-by-feature)             | 기능 하나 고칠 때 폴더 하나만 열도록. 레이어별(routers/schemas/ml) 구조는 기능 5개부터 흩어짐      |
| DB          | **SQLite** + SQLAlchemy 2.0 async (aiosqlite)      | 라즈베리파이 단일 노드, 컨테이너 하나 덜, 파일 하나 백업. `DATABASE_URL` 교체로 Postgres 이전 가능 |
| 캐시/세션   | **인터페이스만** (`core/cache.py`), 구현은 메모리  | Redis는 챗 히스토리 저장을 실제로 켤 때 컨테이너 추가. 안 쓰는 인프라를 미리 돌리지 않음           |
| 정체성      | **익명 visitor 쿠키** (`core/deps.py`), OAuth 없음 | 좋아요 중복 방지·댓글 귀속에 충분. 세부(닉네임 등)는 social 구현 때 결정                           |
| 챗 히스토리 | **서버 저장 예정** — Redis, TTL 7일                | `chat/history.py`에 설계만 기록. 켜기 전까지 클라이언트가 히스토리를 보냄                          |

## 레이아웃

```
be_src/app/
  main.py               create_app(): 기능 라우터 마운트 + lifespan
  core/                 도메인 없는 인프라
    config.py           환경변수 → Settings (모든 knob의 목록이 docstring에)
    lifespan.py         시작: 임베딩 warmup / 종료: DB dispose
    db.py               async 엔진(지연 생성) + get_session Depends + Base
    cache.py            KVCache 프로토콜 (get/set/delete/incr + ttl) — memory | redis
    deps.py             get_visitor_id (익명 쿠키 jhl_vid)
  content/              축 ②: "내가 만든 것" — 읽기 전용, corpus.json이 소스 (chat이 빌려 씀)
    repository.py       corpus.json 로더 (DOCS / NODES / BIO / by_id)
    service.py          list_posts · get · exists · nodes  ← 타 기능은 여기만 호출
    router.py           GET /api/content/posts, /posts/{slug}
  chat/                 축 ①: 랜딩 RAG  (content에 의존, 역방향 없음)
    router.py           HTTP만: /graph, /stream(SSE 직렬화)
    service.py          retrieve → context → generate 오케스트레이션, (event, payload) 이벤트 생성
    retrieval.py        청크 임베딩·코사인 검색·그래프 엣지
    generation.py       Claude 스트리밍 + 추출식 폴백 (같은 출력 형태)
    prompts.py          시스템 프롬프트·컨텍스트 조립 — 톤 수정은 여기서
    history.py          서버 세션 설계 (구현 예정)
    schemas.py
  demos/kmeans/         축 ②: 인터랙티브 데모 API (router · service · schemas)
  social/               축 ③ (예정): 좋아요·댓글·챗 히스토리 — __init__ docstring에 계획
tests/                  TestClient 스모크 (기능별 1개 이상)
```

## 규칙

1. **라우터는 HTTP만.** 파싱·응답 형태·상태코드·SSE 직렬화. 로직은 `service.py`.
   서비스는 전송을 모른다 — `chat.service.answer()`는 `(event, payload)` 튜플을 내고
   라우터가 SSE 문자열로 바꾼다. 테스트와 미래의 websocket이 같은 서비스를 쓴다.
2. **저장소는 인터페이스 뒤에.** 휘발 상태는 `core.cache.get_cache()`, 영속은 `core.db.get_session`.
   클라이언트 라이브러리(redis, sqlite)를 기능 코드가 직접 import하지 않는다.
   구현 선택은 환경변수(`REDIS_URL`, `DATABASE_URL`) 하나로.
3. **기능 간 의존은 service 함수로만.** social이 slug를 검증하면 `content.service.exists()`.
   다른 기능의 repository/내부 모듈 import 금지.
4. **상태는 종류별로 자리가 정해져 있다.**

   | 상태                              | 수명      | 자리                                 |
   | --------------------------------- | --------- | ------------------------------------ |
   | 파생 콘텐츠 (corpus.json)         | 배포 단위 | 파일 → 메모리 (`content.repository`) |
   | ML 런타임 (임베딩 행렬)           | 프로세스  | 메모리, lifespan warmup              |
   | 세션/휘발 (챗 히스토리, 카운터)   | TTL       | `core.cache`                         |
   | 영속 사용자 데이터 (좋아요, 댓글) | 영구      | `core.db` (SQLite)                   |

5. **새 기능 추가 절차.** `app/<feature>/{router,service,schemas}.py` 생성 → `main.py`에
   `include_router(..., prefix="/api")` 한 줄 → `tests/`에 스모크 1개.
   DB 모델이 처음 등장하는 기능에서 Alembic을 도입한다.

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

- `docker-compose.yml`: backend에 `backend-data` 볼륨(`/app/data`, SQLite 파일) — 이미지 갱신에도 유지
- Redis 도입 시: compose에 `redis` 서비스 + backend `REDIS_URL=redis://redis:6379/0` + `core/cache.py`의 RedisCache 구현 + `redis` 의존성. 그 외 변경 없음
- 로컬 개발: `be_src/.venv` (Python 3.12), `pytest` — 첫 실행은 임베딩 모델 로드로 수 초
