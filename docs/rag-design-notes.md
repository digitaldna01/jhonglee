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
| **하이브리드 검색** | dense 임베딩 + BM25 키워드, RRF로 융합 | 고유명사·정확 키워드 질문 보완, 단일 방식 대비 일관된 우위 | ✅ **구현 (2026-08-29, §2.6)** — Postgres `tsvector`(GIN) + 메모리 BM25. 융합은 RRF가 아니라 점수 합 — 이 규모에선 RRF가 평평해짐 |
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

- 양자화 품질 손실 없음. recall@4는 동일 100%. **EN recall@1 손실 2건 중 하나가 "What did you build with k-means?"** —
  토크나이저가 `k-means`를 `k / - / me / ans`로 쪼개 개념을 못 잡고 "build"가 cogsAndGears("translated … into an interactive
  experience")에 끌림 (0.320 vs 0.299). `kmeans`·"k-means project"는 정상. top-4엔 들어가므로 Claude 답변엔 영향 없고
  추출식 폴백만 틀림 → **하이브리드 검색(정확 토큰 매칭)이 고칠 대표 케이스** → §2.6에서 해결(EN 12/12). `scripts/eval_retrieval.py`가 miss@1도 출력
- fp32 원본(+560MB)은 2GB Pi에 불가 → int8(+354MB)로. 예산 ≈ 250 + 1.1GB + 150 = 1.5GB/1.8GB, backend mem_limit 1300m
- 남은 KO 실패 1건 "일러스트 작품 보여줘": visualArtPortfolio 본문 청크 0개 → 콘텐츠 보강으로 해결
- 대안으로 검토했던 것: Haiku 질문 재작성(메모리 0, API 의존) → 멀티턴 후속 질문 재작성 용도로 보류. `bge-m3`(1024-d)는 fastembed 0.8 미지원
- 되돌리기: `EMBED_MODEL=BAAI/bge-small-en-v1.5` (Dockerfile ARG 동일) → 해시가 바뀌어 다음 시작에 자동 재임베딩

## 2.5 후속 질문 처리 (Conversational RAG) — 2026-08-29

검색 결과는 **요청 단위 첨부물**(이번 user 메시지의 `Context:`에만), 대화 기록은 **세션 단위 기억**(Redis, 질문/답만).
이 분리는 표준(LangChain `create_history_aware_retriever`, LlamaIndex `CondensePlusContext`)이고, 비는 자리는 하나 —
후속 질문이 주제어를 생략할 때("초기화 방법은 뭐였어?") 검색이 그 문장만 보는 것.

### 실패 유형
| | 예 | 요구 |
|---|---|---|
| A 생략/지시어 | "그거 더 자세히", "How did you initialise the centroids?" | 직전 주제를 되찾아야 |
| B 주제 전환 | (k-means 후) "타이포그래피 작업은?" | 직전 주제에 **끌려가면 안 됨** |
| C 검색 불필요 | "고마워" | (미해결 — 도구 사용 단계에서) |
| D 언어 전환 | EN 질문 후 KO 후속 | A+다국어 |

### 방법 비교 (골든셋 `followup` 14건: A 7 / B 5 / D 2)
| 방법 | 비용 | A r@1 / r@4 | B r@1 / r@4 | D r@1 / r@4 |
|---|---|---|---|---|
| 질문 단독 (기준) | — | 1/7 / 6/7 | 5/5 / 5/5 | 1/2 / 2/2 |
| RRF(q, **prev+q**) | 임베딩 +1 | 3/7 / 6/7 | **4/5** ↓ | **0/2 / 1/2** ↓ — 긴 이전 질문이 랭킹을 지배 |
| RRF(q, q+prev) w=0.6 | 〃 | 3/7 / 7/7 | 4/5 ↓ | 1/2 / 2/2 |
| **wRRF(q, q + 이전 턴 1위 문서 제목) w=0.6 — 1차 채택** | 〃 (제목은 세션 `last_sources[0]`) | **4/7 / 7/7** | 5/5 / 5/5 | **2/2 / 2/2** |
| **점수 합 cos(q) + 0.3·cos(q+제목) + 0.1·키워드 — 현재 (§2.6)** | 〃 + 키워드 SQL 1회 | **7/7 / 7/7** | 5/5 / 5/5 | 2/2 / 2/2 |
| 질문 재작성 (Haiku condense) | API +1콜, +0.3~0.5초 | (미측정 — 키 필요) | | |

채택 이유: A가 오르고 B·D 무손실. "후속 질문은 방금 얘기한 **그것**에 관한 것"을 이전 질문 전문이 아니라 제목 한 줄로
표현하니, 새 주제가 나오면 제목 하나는 질문 단독 랭킹에 눌린다. 런타임 비용은 임베딩 1회(≈1ms).
**한계 (dev 세션 실측) — §2.6 이후 갱신**
- ~~앵커 = 이전 턴 1위 문서라 1위가 틀리면("k-means?" → cogsAndGears) 다음 턴도 따라감~~ → 하이브리드 검색으로 단발 1위 12/12
- ~~RRF w=0.6은 앵커를 "동점 결정자"로만 작동시켜 "Tell me more about it"류 완전 생략(A 3/7)을 못 살림~~ → 점수 융합이
  앵커 질의의 코사인 크기(0.64 vs 0.27)를 살려 A 7/7. 골든셋 밖의 완전 생략은 여전히 재작성(P3)의 몫
- `sources`의 `score`는 문서별 최고 코사인이고 순서는 융합 점수라, 클라이언트에 표시되는 점수가 순서와 단조가 아닐 수 있음
- 표본 14건 → 과적합 가능. `chat_logs`의 실제 후속 질문을 골든셋에 추가해 재측정
구현: `retrieval.retrieve(..., context_title=)` → `retrieval/hybrid.rank()`, `history.load_session()["last_sources"]`.

### 다음 단계
- **P3 질문 재작성** (`chat/rewrite.py`): history가 있을 때 Haiku 1콜로 독립 **영어** 질문 생성 → 검색. 앵커+하이브리드가
  골든셋을 다 맞추므로, 도입 전 `chat_logs`에서 실패 사례(대명사뿐인 후속, C 유형)를 먼저 모아 골든셋에 넣고 비교 측정.
  처음엔 "history 있으면 항상", 로그로 비율을 본 뒤 조건부로. 키 없으면 위 방식으로 폴백
- **도구 사용(agentic)**: 모델이 검색 여부·질의를 결정 → C 유형까지. LangGraph 도입 시점과 같이 판단 (backend-architecture 결정 표)

## 2.6 하이브리드 검색 (dense + 키워드) — 2026-08-29

동기: 다국어 int8 모델이 "k-means"를 k/-/me/ans로 쪼개 "What did you build with k-means?"의 1위가 cogsAndGears(0.314 vs 0.291)였고,
후속 질문 앵커가 그 틀린 1위를 다음 턴에 물려받았다. 정확 토큰 매칭이 보완할 영역.

### 구성
| | Postgres (프로덕션) | MemoryStore (SQLite 폴백·테스트·평가) |
|---|---|---|
| 인덱스 | `rag_chunks.tsv = to_tsvector('english', passage)` 생성 컬럼 + GIN (마이그레이션 0004) | 파이썬 BM25 (k1 1.2, b 0.75), `apply()` 뒤 지연 재생성 |
| 질의 | `to_tsquery('english', 'a | b | c')` OR, `ts_rank_cd`, 문서별 최고 청크 `DISTINCT ON` | 같은 토크나이저 → BM25, 문서별 최고 청크 |

토크나이저(`store.words` / `store.terms`)는 PG `english` 설정을 흉내낸다(스톱워드 + Porter 1a/1b). 결정 세 가지:
1. 하이픈 복합어는 통째 **+ 조각** ("k-means" → k-means, k, means). PG의 `k-mean <-> k <-> mean` 구문 검색만으로는
   본문의 "KMeans"/"k clusters"를 못 맞춘다 — 코퍼스에 literal "k-means"가 없다
2. 라틴/한글 경계 분리 ("k-means로" → k-means, 로): 한국어 질문 속 영어 이름
3. 질문용 동사·필러 스톱워드 (tell show use make anything one …): 한 포스트에만 있는 "tell", "living"(↔ live demo)이
   단독 히트로 임베딩 1위를 뒤집었음

### 융합: RRF가 아니라 점수 합
9문서 코퍼스에서 dense 후보 20개는 곧 전체 → RRF에선 순위 차가 1/61 vs 1/66으로 평평하고, 키워드 리스트 **소속** 자체가
한 칸(1/61)을 통째로 준다. 앵커 질의가 0.643 vs 0.274로 압도해도 RRF는 그 크기를 버린다("초기화 방법은 뭐였어?" 실패).
한 모델의 코사인은 질의 간 비교 가능하므로:

    final = cos(q) + 0.3·cos(q + 이전 턴 1위 제목) + 0.1·(kw / kw_max)        # hybrid.rank(fusion="score")

- **키워드 게이트 0.6**: 질문 단독 코사인이 최고의 60% 미만인 문서는 키워드 히트를 무시 — dense가 recall, 키워드가 precision(리랭커 역할).
  게이트는 질문 단독 코사인만 본다: 앵커 질의엔 제목이 들어가 앵커 문서 점수가 부풀고, 그걸 기준으로 삼으면 주제 전환이 막힌다
- **앵커 가중치 0.6 → 0.3**: 같은 이유로 앵커 문서는 항상 +0.36을 받았고, 그러면 주제 전환(B)이 3/5로 무너진다
- 인용 청크: 문서를 가장 높이 올린 랭킹의 청크, 동점이면 키워드 히트(질문의 단어가 그대로 있는 청크)

### 측정 (`scripts/eval_retrieval.py --sweep`, r@1 / r@4)
| 설정 | EN (12) | KO (14) | A (7) | B (5) | D (2) |
|---|---|---|---|---|---|
| 이전 프로덕션: RRF ctx 0.6, 키워드 없음 | 10 / 12 | 13 / 13 | 4 / 7 | 5 / 5 | 2 / 2 |
| RRF + 키워드 0.5 (게이트 0.6) | 11 / 12 | 13 / 13 | 6 / 7 | 5 / 5 | **1** / 2 — 'fastest'가 kmeans 본문에 |
| 점수 합 ctx 0.3, 키워드 0 | 10 / 12 | 13 / 13 | 6 / 7 | 4 / 5 | 1 / 2 |
| **점수 합 ctx 0.3, 키워드 0.1 — 채택** | **12** / 12 | 13 / 13 | **7** / 7 | **5** / 5 | **2** / 2 |
| 〃 키워드 0.05 ~ 0.15 | 12 | 13 | 7 | 5 (0.05는 4) | 2 |
| 점수 합 ctx ≥ 0.4 | 12 | 13 | 7 | **3** / 5 | 2 |
| 〃 게이트 0 | 11 | 13 | 7 | 5 | 2 |
| 〃 앵커 질의도 키워드 검색 | 12 | 13 | 7 | **3~4** / 5 | 2 |
| PgVectorStore(tsvector), 채택 설정 (`--pg`) | 12 | 13 | 7 | 5 | 2 — 메모리 BM25와 동일 |

남은 실패 1건: "일러스트 작품 보여줘" — visualArtPortfolio 본문 청크 0개(콘텐츠). 질의당 메모리 1–2 ms, PG 7–9 ms
(dense 2회 + 키워드 1회). 라이브 API 3턴 확인: k-means → "How did you initialise the centroids?" → "Have you used XGBoost?" 모두 정답.

### 한계·메모
- `ts_rank_cd`엔 IDF가 없다: "illustration work"의 'work'가 모든 포스트에 걸려 PG 점수는 smartfactory 0.3 > visualArt 0.2
  (BM25는 반대). 게이트·정규화 덕에 최종 순위는 같았지만 코퍼스가 커지면 재검토 (`ts_rank_cd(…, 32)` 정규화 또는 파이썬 BM25로 통일)
- 한국어는 조사가 붙은 채 토큰이 되어(만들었어, 방법은) 키워드가 거의 안 걸린다 — 의도된 분업: 한국어 질문은 dense, 키워드는 그 안의 영어 이름
- 표본 40건 → 과적합 가능. `chat_logs`의 실제 질문으로 골든셋을 키운 뒤 재스윕. 상수는 `retrieval/hybrid.py` 상단 — 재측정 없이 바꾸지 말 것

### 골든셋 키우기 — `scripts/mine_golden.py` (2026-08-29)
골든셋의 재료는 Redis 세션(7일 휘발)이 아니라 Postgres `chat_logs`(영구, append-only). 흐름은 세 단계:
1. **mine** — `chat_logs`에서 골든셋에 없는 질문을 `golden_candidates.json`으로: 검색이 돌려준 문서(`got`), 최고 코사인, 같은 세션
   30분 안의 직전 질문(`prev` → 두 턴 케이스), 실패 힌트 플래그(`low-score` < 0.2, `fallback` Claude 답 아님, `repeat` 같은 세션에서 재질문)
2. **label** — 사람이 `expect`를 채움. `got`은 시스템의 추측일 뿐, 사람이 틀렸다고 해야 실패. 후속이면 `type` A/B/D 지정
3. **merge** — `--merge`가 라벨된 것만 언어 버킷/`followup`에 추가하고 후보 파일에서 뺌 → `eval_retrieval.py --sweep` 재측정

Pi에선 컨테이너 파일이 휘발이라 `docker compose exec -T backend python scripts/mine_golden.py --out -`로 stdout에 받아 로컬에 저장.
후보 파일은 gitignore(작업 파일), 골든셋만 커밋.

## 2.7 생성 프롬프트 — 실제 Claude로 프로빙 (2026-08-29)

키를 넣고 Haiku 4.5로 7문항(한국어·후속·범위 밖·미기재 사실·인젝션·톤·의견)을 찔러 본 결과와 그에 따른 `prompts.py` 수정:

| 프로빙 | 수정 전 | 수정 |
|---|---|---|
| 한국어 답 | 한 답 안에서 "만들었어요… 있어" 존댓말/반말 혼용 | "In Korean, use polite 해요체 consistently" |
| "가장 자랑스러운 프로젝트는?" | 글에 없는 감상("that moment when tensor networks click…")을 1인칭으로 지어냄 | "never invent facts, opinions, feelings or preferences for Jae" → 이제 "not covered here"라고 답하고 글에 쓴 태도로 대신함 |
| "삼성에서 일했나?" | "I haven't worked at Samsung" — 컨텍스트에 없을 뿐인데 부정 단정 | "say it isn't covered here — don't confirm or deny it" |
| 인젝션("해적 시") | 거절은 하지만 답에 `**굵게**` 마크다운 — 프런트는 `{m.text}` 그대로 출력 | "Plain text only: no markdown, no bullet lists" |
| 한국어 2턴 뒤 영어 "Tell me more about it" | 시스템 프롬프트의 "질문 언어로"를 무시하고 한국어로 답함 | 언어를 모델 판단에 안 맡기고 서버가 정함: `answer_language()`(한글 유무) → user 턴 끝에 "(Answer in English.)" |
| "Tell me more about it" | 검색은 KMeans 1위(0.59)인데 3번 중 1번 컨텍스트의 더 풍부한 Quantum 발췌를 설명 | 머리말 힌트로는 부족(여전히 1/3) → ① 컨텍스트를 Anthropic 권장 형태인 번호 붙은 `<documents><document index title type>` XML로 ② 서버가 아는 이전 턴 주제(`context_title`)를 user 턴에 명시 "(This is a follow-up; the previous answer was about "KMeans Clustering".)" → 4/4 |
| 범위 밖("서울 날씨"), 톤 | 문제 없음 | — |

검증된 기법 중 가져온 것: Anthropic 프롬프트 가이드의 **XML 태그로 문서 구분 + 질문은 맨 끝**, LangChain `rlm/rag-prompt`의 골격("retrieved context만 사용,
모르면 모른다고, 3문장 이내"), 후속 질문 주제 명시(history-aware retriever 계열이 재작성으로 푸는 것을 우리는 앵커 제목으로 대신).
안 가져온 것: 인용 번호([1]) — 프런트가 sources 카드를 따로 보여주므로 중복; "먼저 관련 인용문을 뽑고 답하라"(quote-then-answer) — 답이 길어지고 300토큰 한도와 충돌.

프롬프트 밖 발견: "초기화 방법은 뭐였어?"에 모델이 "포트폴리오에 안 적혀 있다"고 답했는데 실제론 포스트 청크 #1에 "Four ways to start"가 있다.
문서는 맞췄지만 인용 청크가 #0(도입부) — 한국어 질문이 영어 청크와 키워드가 안 맞아서. **P3 재작성(영어 독립 질문)이 정확히 고치는 케이스**;
대안은 1위 문서에 한해 청크 2개 인용. 모델은 정직했다(없다고 했지 지어내지 않음).

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
- [x] **P2-2** 서버 세션(Redis, history.py) + 레이트 리밋(방문자+IP) + `chat_logs` — 2026-08-29.
      프런트는 페이지당 `session_id` 전송, 429는 안내 문구로 처리. 시맨틱 캐시는 로그로 반복 질문 비율을 본 뒤 결정
- [x] **P2-3** 후속 질문 앵커: 이전 턴 1위 문서 제목 + 세션 `last_sources` (§2.5) — 2026-08-29
- [x] **P2-4** 하이브리드 검색: `rag_chunks.tsv`(GIN) | 메모리 BM25, 점수 융합 + 게이트, `retrieval/` 패키지 승격,
      `eval_retrieval.py --sweep/--pg` (§2.6) — 2026-08-29
- [x] **P2-5** 골든셋 채굴 `scripts/mine_golden.py`: chat_logs → 후보 → 라벨 → merge (§2.6) — 2026-08-29.
      배포 후 실제 질문이 쌓이면 돌려서 재스윕 — 이게 평가 주도 루프의 시작점
- [ ] **P3** corpus.json을 커밋 대상에서 제외 — CI(deploy.yml)가 `npm run corpus`를 돌려 백엔드 이미지에
      아티팩트로 포함하거나 `POST /api/admin/ingest`로 전달. 동기화를 사람 기억에서 CI로.
      그다음 `/api/content/*`도 rag_documents를 읽게 하면 corpus.json 자체가 사라질 수 있음
- [ ] **P2** `relations` 선언 엣지 + 그래프 표시 구분
- [x] **P3 → 완료 2026-08-29** 한국어 질문 대응 — 골든셋 실측 후 **multilingual-MiniLM-L12 int8**로 교체
      (KO recall@4 64%→93%, EN 100% 유지, +354MB). `chat/embedding.py` 커스텀 등록, `scripts/eval_retrieval.py` 편입.
      Pi 첫 배포 후 `docker stats` 실측 → 스왑 사용 시 bge-small + Haiku 질문 재작성으로 회귀
- [ ] **P3** 리랭커 (fastembed rerank) — 검색 품질 문제가 실측되면
- [x] **P2-3** 후속 질문 1단계: 골든셋 `followup` + 제목 앵커 가중 RRF — 2026-08-29 (§2.5)
- [ ] **P3** 멀티턴 질문 재작성 (`chat/rewrite.py`, Haiku 1콜: 후속 질문 → 독립 영어 질문) — API 키 켠 뒤, §2.5 표로 비교

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
