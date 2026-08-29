# jhonglee.com

개인 포트폴리오 사이트 — 프로젝트/글을 **지식 그래프 랜딩**과 **RAG 챗**으로 탐색한다.
Raspberry Pi(arm64) 위 Docker Compose로 self-host.

```
fe_src/     React + Vite (+ nginx, /api 프록시)  — 포스트(mdx)가 사이트 콘텐츠이자 RAG 코퍼스의 단일 소스
be_src/     FastAPI — 콘텐츠 API · RAG 챗(SSE) · 데모 API      → be_src/README.md
docs/       설계 결정 기록 — backend-architecture.md, rag-design-notes.md
```

## 아키텍처 한눈에

```
mdx 포스트 ──(npm run corpus)──▶ corpus.json ──▶ 백엔드 시작 시 해시 대조 → 바뀐 청크만 임베딩 → Postgres(pgvector + tsvector)
브라우저 ──POST /api/chat/stream──▶ FastAPI ──▶ 하이브리드 검색(코사인 + 키워드, 점수 융합) → Claude 스트리밍 ──SSE──▶ 브라우저
                                     └─ Redis: 세션·카운터 (core/cache.py)
```

- 지식의 원본은 `fe_src/src/posts/*.mdx` + `fe_src/src/content/*.md` 하나뿐. 사이트 페이지·그래프 노드·챗 검색이 모두 여기서 파생
- 임베딩: fastembed(ONNX) 다국어 MiniLM-L12 **int8**, 384차원 — 한국어 질문 → 영어 문서 cross-lingual 검색. 세부는 `docs/rag-design-notes.md`

## 실행

| 목적 | 명령 | 주소 |
|---|---|---|
| 개발 (핫 리로드) | `docker compose -f docker-compose.dev.yml up --build` | http://localhost:5173 |
| 프로덕션 동형 (nginx) | `docker compose -f docker-compose.local.yml up --build` | http://localhost:8080 |
| Pi (CI가 실행) | `docker compose up -d` — `main` 푸시 → GHCR 빌드 → self-hosted runner | https://jhonglee.com |

- 로컬 시크릿은 compose 파일 옆 `.env` (`.env.example` 참고). **프로덕션은 GitHub Actions Secrets**
  (`ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD`) — 배포 워크플로가 Pi에서 `.env`를 생성. 키가 없으면 챗은 검색 결과만으로 답함
- 로컬 스택에서 Postgres는 `localhost:5433`, Redis는 `localhost:6380`으로 노출 (DB 뷰어 연결용)
- 포스트를 고친 뒤엔 `cd fe_src && npm run corpus` → `corpus.json` 커밋. 백엔드는 다음 시작 때 바뀐 청크만 재임베딩

## 더 읽기

- `docs/backend-architecture.md` — 패키지 구조, 규칙, 상태의 자리, 배포 메모
- `docs/rag-design-notes.md` — 검색·인덱싱 기법 조사와 채택 결정, 로드맵
