# RAG 설계 노트 — 검색·인덱싱 기법과 채택 결정

> 랜딩 "Ask me anything" RAG의 기술 조사 + 이 사이트 기준 채택/보류 결정 기록.
> 살아있는 문서 — 새 기법을 찾으면 여기에 추가하고, 결정이 바뀌면 표를 갱신한다.
>
> 전제 규모: 문서 10~20개(mdx 포스트 + bio), 청크 수백 개 이하, 라즈베리파이 배포.
> 마지막 업데이트: 2026-08-29

---

## 0. 현재 아키텍처 (요약)

```
시작 → corpus.json 청크 해시 vs rag_chunks 대조 → 바뀐 청크만 임베딩 (chat/ingest.py)
질문 → 임베딩(fastembed, multilingual-MiniLM-L12 int8 — chat/embedding.py)
     → pgvector `ORDER BY embedding <=> q` (문서별 최고 청크 DISTINCT ON → top-4)
       (DATABASE_URL이 SQLite면 numpy MemoryStore로 동일 동작)
     → 컨텍스트 조립(desc + bio 상시 포함)
     → Claude Haiku 4.5 스트리밍 (키 없으면 추출식 폴백)
     → SSE: sources → delta → done
```

- 코드: `chat/ingest.py`(증분 sync), `chat/store.py`(pgvector | numpy), `chat/retrieval.py`(검색·엣지),
  `chat/router.py`(SSE), `chat/prompts.py`(프롬프트)
- 그래프 엣지도 같은 임베딩에서 파생 (노드당 top-2 유사 이웃, 가중치 0.15–0.85 리스케일)

## 1. 문서 스키마 방향 (결정됨)

**mdx 포스트가 코퍼스의 단일 소스.** `export const metadata` → YAML frontmatter로 전환하면
JS(remark-frontmatter)와 Python(python-frontmatter)이 같은 파일을 읽는다.

```yaml
---
id: kmeansVisualizer        # 파일명 = 안정 키
title: KMeans Clustering
date: 2024-09-27
kind: post                  # project | post | bio
lean: ml                    # 그래프 축: research | ml | design | art
tags: [kmeans, clustering]
stack: FastAPI · React
summary: >                  # 모델이 인용하는 1–3문장 (구 desc)
  ...
thumbnail: /images/...      # 표시 전용
medium: figure              # figure | artwork (WORK 카드 시스템)
rag:
  include: true             # 코퍼스 포함 여부
  node: true                # 그래프 노드 여부
relations:                  # 온톨로지-라이트 (§3)
  - { to: smartfactoryDashboard, rel: applied-in }
---
본문 → 섹션 단위 청킹되어 검색 대상
```

파이프라인: `posts/*.mdx + content/*.md → (npm run corpus) → corpus.json → be_src 시작 시 해시 대조 → 바뀐 청크만 임베딩 → rag_chunks`.
새 글 작성 = 새 노드 + 새 검색 문서. 별도 등록 없음.

### 코퍼스 전용 문서 — `src/content/`

블로그에 안 나오지만 대화에 도움되는 지식은 `fe_src/src/content/*.md`에 둔다:

- 사이트 어디에도 렌더되지 않고, 검색·답변에만 쓰임 (`url: null`, `node` 기본 false)
- `category`가 POST/PROJECTS/BIO 외의 값(NOTE, FAQ, …)이면 소문자 kind로 그대로 통과 —
  새 문서 타입에 코드 수정 불필요
- 예: `interests.md`(관심사·취향), `faq.md`(자주 묻는 질문), `skills.md`(기술 스택 상세)
- bio만 특별 취급(컨텍스트 상시 포함); 나머지 content 문서는 일반 검색으로 걸림
- 작성 후 `npm run corpus` 실행 필수 (출력 커밋)

## 2. 검색·인덱싱 기법 조사 (2026)

2026년 표준 파이프라인:

```
질문 → (질문 재작성) → 하이브리드 검색(dense top-50 + BM25 top-50, RRF 융합)
     → 크로스인코더 리랭킹 → top 5–8 → 컨텍스트 빌더 → LLM(인용 구조화)
```

### 기법별 판정

| 기법 | 내용 | 보고된 효과 | 이 사이트 판정 |
|---|---|---|---|
| **Contextual Retrieval** | 청크 앞에 문서 문맥 요약을 붙여서 임베딩 (Anthropic) | top-20 검색 실패 35%↓, BM25 결합 시 49%↓, 리랭킹까지 67%↓ | ✅ **채택** — LLM 없이 frontmatter 템플릿으로: `"From {title} ({kind}, {tags}): {chunk}"` |
| **하이브리드 검색** | dense 임베딩 + BM25 키워드, RRF로 융합 | 고유명사·정확 키워드 질문 보완, 단일 방식 대비 일관된 우위 | ✅ **채택** — `rank-bm25` 몇 줄, 인프라 불필요. "XGBoost 써봤어?" 류 질문에 결정적 |
| **부모-자식(계층) 청킹** | 작은 자식 청크(128–256tok)로 검색, 큰 부모(512–1024tok)를 LLM에 제공 | 2025–26 프로덕션에서 가장 널리 채택된 패턴 | ✅ **채택(간이형)** — 섹션 청크로 검색, 컨텍스트엔 summary + 해당 섹션 |
| **청크 크기** | 사실형 256–512tok, 분석형 512–1024tok | — | 섹션(`##`) 경계 우선, 256–512tok 목표 |
| **청크 오버랩** | 10–20% 권장이 통설 | 2026-01 체계 분석에선 이득 없음, 인덱싱 비용만 증가 | 섹션 경계 청킹이라 **오버랩 불필요** |
| **리랭킹 (크로스인코더)** | 후보를 질문과 함께 재채점 | 정밀도 대폭↑, 느려서 사전 필터된 집합에만 적용 | ⏸ **2단계 보류** — 후보가 수십 개뿐이라 이득 작고 Pi 부담. fastembed 리랭커로 추가 가능 |
| **벡터 DB** (Qdrant, pgvector 등) | 대규모 ANN 인덱스 | — | ✅ **pgvector 채택 (2026-08-29 결정 변경)** — 성능 때문이 아니라 ① 임베딩을 배포에서 분리(증분 인제스트: 청크 내용 해시로 바뀐 것만 재임베딩·삭제 동기화) ② 하이브리드 검색을 SQL(`tsvector` + `<=>`)로 ③ 오래 쓸 RAG 기반 학습. Qdrant 대신 pgvector: 컨테이너 하나, 백업 하나, 메타데이터 JOIN. 그래프 엣지는 O(n²)라 sync 끝에 전체 재계산 |
| **Late chunking** (Jina) | 문서 전체를 먼저 임베딩 후 청크 풀링 | BEIR 이득, 문서 길수록 커짐 | ❌ 장문서용 — 해당 없음 |
| **ColBERT / late interaction** | 토큰 단위 다중 벡터 매칭 | 정밀도↑, 저장량 수십 배 | ❌ 과함 |
| **질문 재작성 / HyDE** | 멀티턴에서 후속 질문을 독립 질문으로 재작성 | 멀티턴 RAG 정확도↑ | 🤔 **후보** — "그거 더 알려줘" 류 후속 질문 검색이 약해지면 도입 (Haiku로 재작성 1콜) |

### 임베딩 모델 (2026-08-29 교체)

| 항목 | 값 |
|---|---|
| 모델 | **`Xenova/paraphrase-multilingual-MiniLM-L12-v2-q8`** — sentence-transformers 다국어 MiniLM-L12의 **int8 ONNX**. fastembed 카탈로그에 없어 `chat/embedding.py`의 `CUSTOM`에 등록(add_custom_model) |
| 이전 | `BAAI/bge-small-en-v1.5` (영어 전용, 65MB). 한국어 질문 recall@4 64%라 교체 |
| 차원 / 크기 | **384**(동일 → 스키마 무변경) / 118MB, mean pooling, L2 정규화 |
| 런타임 | fastembed → onnxruntime CPU. peak RSS 622MB (bge 268MB, 원본 fp32 830MB) |
| 언어 | 50+개 언어, 한국어 포함. 질문(KO) → 문서(EN) cross-lingual 검색 |
| 파일 위치 | `/tmp/fastembed_cache/` — Dockerfile이 `ARG EMBED_MODEL`로 빌드 시 다운로드(`python app/chat/embedding.py <model>`), 같은 값이 런타임 기본값 |
| 쓰이는 곳 | ① ingest: `embed_passages` → `rag_chunks.embedding` ② 요청: `embed_query` → pgvector `<=>` |
| 평가 | `scripts/eval_retrieval.py` + `scripts/golden_set.json` (EN 12 / KO 14) — 모델·청킹 바꿀 때마다 같은 숫자로 비교 |

- 저장과 검색은 **반드시 같은 모델**. `rag_chunks.model` 컬럼 + 해시에 모델명이 들어가서 `EMBED_MODEL`을 바꾸면 다음 시작 때 전부 자동 재임베딩
- 단 **차원이 바뀌면** `vector(384)` 컬럼·HNSW 인덱스 마이그레이션이 먼저 필요 (`chat/models.py EMBED_DIM`, 0002 참고)
- bge 계열은 query prefix 관례 → fastembed의 `query_embed`/`passage_embed`를 쓴다 (직접 `embed()` 쓰지 말 것)
- bio 문서는 passage를 질문 형태로 보강해 검색률을 올림 ("Who are you? Who is Jae Hong Lee? …" — ingest.py `passage_text`)

**골든셋 비교 (2026-08-29, 실제 코퍼스 30청크)**

| 모델 | EN r@1 / r@4 | KO r@1 / r@4 | 질문 1개 | peak RSS |
|---|---|---|---|---|
| bge-small-en-v1.5 (이전) | 92% / 100% | 43% / 64% | — | 268MB |
| multilingual-MiniLM-L12 fp32 | 83% / 100% | 79% / 93% | 9ms | 830MB |
| **multilingual-MiniLM-L12 int8 (채택)** | 83% / 100% | 93% / 93% | 2ms | **622MB** |

- 양자화 품질 손실 없음. EN recall@1 −1은 애매한 질문(Blender/illustration), recall@4는 동일 100%
- fp32 원본(+560MB)은 2GB Pi에 불가 → int8(+354MB)로. 예산 ≈ 250 + 1.1GB + 150 = 1.5GB/1.8GB, backend mem_limit 1300m
- 남은 KO 실패 1건 "일러스트 작품 보여줘": visualArtPortfolio 본문 청크 0개 → 콘텐츠 보강으로 해결
- 대안으로 검토했던 것: Haiku 질문 재작성(메모리 0, API 의존) → 멀티턴 후속 질문 재작성 용도로 보류. `bge-m3`(1024-d)는 fastembed 0.8 미지원
- 되돌리기: `EMBED_MODEL=BAAI/bge-small-en-v1.5` (Dockerfile ARG 동일) → 해시가 바뀌어 다음 시작에 자동 재임베딩

## 3. 온톨로지 / 지식그래프 판정

**결론: 정통 온톨로지(RDF/OWL/트리플스토어/SPARQL)는 이 규모에 과하다. 개념의 20%만 채택한다.**

- 업계 기준: 단일홉·문서 중심 질문 → 벡터 RAG + 리랭커. 멀티홉·관계 순회 질문 → GraphRAG.
  벡터 RAG는 며칠에 출시, 지식그래프는 온톨로지 설계에 주~월 단위
- GraphRAG 경량 대안 계보 (문서 수천 개 규모용 — 우리에겐 여전히 과함):
  LightRAG, nano-graphrag, LazyGraphRAG(인덱싱 비용을 벡터 RAG 수준으로), MiniRAG, KET-RAG

**채택하는 20% — frontmatter `relations` (온톨로지-라이트):**

```yaml
relations:
  - { to: handPoseEstimation, rel: uses-ml }
  - { to: smartfactoryDashboard, rel: applied-in }
```

- 랜딩 맵이 이미 지식그래프 UI다. 이 필드로 엣지가 임베딩 유사도(우연)가 아닌 **의도된 관계**가 됨
- 유사도 엣지와 병행 가능: 선언 엣지 = 실선(+라벨), 유사도 엣지 = 점선
- "이 프로젝트가 어디로 이어졌어?" 류 관계 질문에 그래프 순회로 답할 재료
- 각 항목은 그대로 트리플(주어–술어–목적어)이라, 진짜 온톨로지로 키울 때 마이그레이션 경로가 됨
- 술어(rel) 어휘는 작게 유지: `applied-in`, `evolved-from`, `same-medium`, `built-with` 정도에서 시작

## 4. 로드맵

- [x] **P1** frontmatter 전환 + corpus.json 빌드 파이프라인 (fe/be 단일 소스) — 2026-08-23
      `npm run corpus` → be_src/app/data/corpus.json + fe corpus.gen.json (커밋 대상)
- [x] **P1** 섹션 청킹 + 템플릿 컨텍스추얼 임베딩 — 2026-08-23
      청크 = `##` 섹션(≤2200자), passage = "From {title} ({kind}; {tags}): {chunk}",
      문서 점수 = max(청크), summary 합성 청크로 본문 빈약한 문서도 검색 가능
- [x] **P2-0** 인프라: Postgres+pgvector, Redis, Alembic, compose 3종 — 2026-08-29
- [x] **P2-1** rag_documents/rag_chunks(vector(384), HNSW) + `chat/ingest.py` 해시 sync + retrieval→pgvector, 챗 경로 async — 2026-08-29
      청크 id = `{doc}#{sha256(model+passage)[:12]}` (DB 쪽에서 생성 — build-corpus.mjs 수정 불필요)
- [ ] **P2-2** 서버 세션(Redis, history.py) + 레이트 리밋 + 대화/검색 로그 테이블
- [ ] **P2** 하이브리드 검색 (pgvector + tsvector, RRF) + 골든셋 평가 스크립트
- [ ] **P3** corpus.json을 커밋 대상에서 제외 — CI(deploy.yml)가 `npm run corpus`를 돌려 백엔드 이미지에
      아티팩트로 포함하거나 `POST /api/admin/ingest`로 전달. 동기화를 사람 기억에서 CI로.
      그다음 `/api/content/*`도 rag_documents를 읽게 하면 corpus.json 자체가 사라질 수 있음
- [ ] **P2** `relations` 선언 엣지 + 그래프 표시 구분
- [x] **P3 → 완료 2026-08-29** 한국어 질문 대응 — 골든셋 실측 후 **multilingual-MiniLM-L12 int8**로 교체
      (KO recall@4 64%→93%, EN 100% 유지, +354MB). `chat/embedding.py` 커스텀 등록, `scripts/eval_retrieval.py` 편입.
      Pi 첫 배포 후 `docker stats` 실측 → 스왑 사용 시 bge-small + Haiku 질문 재작성으로 회귀
- [ ] **P3** 리랭커 (fastembed rerank) — 검색 품질 문제가 실측되면
- [ ] **P3** 멀티턴 질문 재작성 (`chat/rewrite.py`, Haiku 1콜: 후속 질문 → 독립 질문) — 후속 질문 검색 실패가 보이면

## Sources

- [Firecrawl — Best Chunking Strategies for RAG in 2026](https://www.firecrawl.dev/blog/best-chunking-strategies-rag)
- [Airbyte — RAG Document Chunking: 6 Best Practices](https://airbyte.com/agentic-data/ag-document-chunking-best-practices)
- [Atlan — Chunking Strategies for RAG: Trade-offs](https://atlan.com/know/chunking-strategies-rag/)
- [Databricks — Ultimate Guide to Chunking Strategies](https://community.databricks.com/t5/technical-blog/the-ultimate-guide-to-chunking-strategies-for-rag-applications/ba-p/113089)
- [CallMissed — RAG Best Practices 2026: Chunking, Reranking, Hybrid Search](https://www.callmissed.com/en/blog/rag-best-practices-2026)
- [Meilisearch — 9 Advanced RAG Techniques (2026)](https://www.meilisearch.com/blog/rag-techniques)
- [DigitalApplied — RAG Chunking Strategies: 2026 Retrieval Playbook](https://www.digitalapplied.com/blog/rag-chunking-strategies-2026-retrieval-quality-playbook)
- [Contextual RAG System with Hybrid Search and Reranking (구현 예)](https://github.com/chatterjeesaurabh/Contextual-RAG-System-with-Hybrid-Search-and-Reranking)
- [DEV — RAG Is Not Dead: Advanced Retrieval Patterns 2026](https://dev.to/young_gao/rag-is-not-dead-advanced-retrieval-patterns-that-actually-work-in-2026-2gbo)
- [Atlan — Knowledge Graph vs RAG: When Each One Wins (2026)](https://atlan.com/know/knowledge-graphs-vs-rag-for-ai/)
- [Awesome-GraphRAG — 서베이/논문/프로젝트 큐레이션](https://github.com/DEEP-PolyU/Awesome-GraphRAG)
- [nano-graphrag — 경량 GraphRAG 대안 분석](https://gonamlui.com/blog/brief-breakdown-of-nano-graphrag-a-lightweight-alternative-to-graphrag)
- [Medium — GraphRAG vs HippoRAG vs PathRAG vs OG-RAG 아키텍처 선택](https://medium.com/graph-praxis/graphrag-vs-hipporag-vs-pathrag-vs-og-rag-choosing-the-right-architecture-for-your-knowledge-graph-a4745e8b125f)
- [Anthropic — Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
