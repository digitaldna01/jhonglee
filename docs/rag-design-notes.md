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
- 그래프 엣지도 같은 임베딩에서 파생 — 서로의 최근접 2개 안에 있고(상호 kNN) 평균 + 0.5σ 이상인 쌍만, 나머지는 부유 (§2.8)

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
- `cv.md`(2026-08-30): 연락처(이메일·GitHub·LinkedIn·Instagram)·학력·경력·연구·기타 프로젝트·논문 — 이력서 PDF에서 옮김, 전화번호는 뺌. bio에 없던 것들 — "삼성 다녔어?", "연락은 어떻게?"가
  "자료에 없음"으로 끝나던 원인. 요약은 짧게("where to reach him, where he studied…") — 처음엔 요약에 "email, GitHub, LinkedIn…"을
  나열했더니 요약 청크가 본문 섹션을 이겨 주소 없는 컨텍스트가 됐다(§2.11). 골든셋 영향: "What do you do for a living?" 1위 bio→cv(정답에 추가)
- 작성 후 `npm run corpus` 실행 필수 (출력 커밋)
- **생성 문서 하나**: 빌더가 `projectIndex`(kind `index`, `node: false`)를 덧붙임 — 검색에서는 열거 질문(목록·개수·"뭐 만들었어")에만 후보(§2.10) — 요약은 "이 사이트의 프로젝트 N개: 제목, …", 본문 한 청크는
  프로젝트당 한 줄(제목·연도·excerpt). "프로젝트 다 말해줘"는 검색 top-4로는 답할 수 없어서(§2.9 E25: "네 개"라며 셋 나열) 목록 자체가
  문서여야 하고, 손으로 쓰면 다음 글부터 낡으니 코퍼스와 함께 생성. 골든셋 영향 없음(아래) — 단 임베딩 passage에 "What have you built?"
  같은 질문형 접두어를 붙이면 "What do you do for a living?"을 빼앗아 EN 12→11이 되어 뺐다

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

### 배포 전 실측 — 임베딩 배치가 메모리를 정한다 (2026-08-30)

프로덕션 compose를 arm64 이미지로 Mac에서 그대로 띄워 보니 백엔드 RSS가 **1.25 GB**(한도 1.27 GB에 밀착). 모델을 bge-small로 바꿔도 1.25 GB —
모델이 아니었다. 단계별로 재 보니 모델 로드 491 MB(MiniLM int8; bge 184 MB), 패시지 8건 578 MB, **코퍼스 40건을 한 배치로 넣는 순간 1.7 GB**
(bge 1.3 GB): fastembed 기본 batch 256 = 전체를 onnxruntime 한 번에, ORT 아레나는 그 피크로 커진 뒤 안 줄어든다. 배치 8 → 822 MB, 4 → 665,
2 → 584, **1 → 541 MB이고 오히려 가장 빠름**(1.3 s vs 1.7 s — CPU 추론은 배칭 이득이 없다). `embedding.EMBED_BATCH = 1`. 풀스택(pgvector·Redis·
nginx) 실측: backend 575 MB · db 25 · redis 10 · web 12 → Pi 기본 사용 ~380 MB를 더해 ≈ 1.0 GB / 1.8 GB, 스왑 없이 들어간다. 로드맵의
"스왑 쓰면 bge-small로 회귀"는 필요 없어짐 — 재작성이 실패해도 한국어를 받는 MiniLM을 유지.

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
- ~~**P3 질문 재작성**~~ → 2026-08-30 도입, §2.10. 조건부(한국어 또는 참조어 있는 영어 후속)로 시작했고 키 없으면 앵커 방식으로 폴백
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
안 가져온 것: 인용 번호([1]) — 프런트가 답변 아래 sources 줄(포스트 링크)을 따로 보여주므로 중복; "먼저 관련 인용문을 뽑고 답하라"(quote-then-answer) — 답이 길어지고 300토큰 한도와 충돌.

프롬프트 밖 발견: "초기화 방법은 뭐였어?"에 모델이 "포트폴리오에 안 적혀 있다"고 답했는데 실제론 포스트 청크 #1에 "Four ways to start"가 있다.
문서는 맞췄지만 인용 청크가 #0(도입부) — 한국어 질문이 영어 청크와 키워드가 안 맞아서. **P3 재작성(영어 독립 질문)이 정확히 고치는 케이스**;
대안은 1위 문서에 한해 청크 2개 인용. 모델은 정직했다(없다고 했지 지어내지 않음).

## 2.8 랜딩 그래프 엣지 — 상위 k개 → z-score 임계값 → 상호 kNN ∩ z (2026-08-29)

이전 규칙 "노드당 상위 2개 이웃"은 약해도 무조건 잇는다. 요약 벡터 8개의 실제 코사인 행렬을 보면(값 0.05–0.55) 구조는 이미 있었다:
designStudy–visualArt 0.55, cogs–designStudy 0.44, smartfactory–designStudy 0.40 (디자인 덩어리) / kmeans–handPose 0.33 (ML 쌍) /
quantum(최대 0.30)·gillSans(최대 0.31)은 아무와도 특별히 안 비슷함. 상위 2개 규칙은 이 마지막 둘까지 우연한 상대와 이어 놓았다.

**보편적인 "비슷함" 임계값은 없다** (문헌: 이방성 — 임베딩이 좁은 원뿔에 몰려 무관한 쌍도 0.2~0.3; 0.8 같은 절대값은 모델마다 뜻이 다름).
검토한 대안:
| 방식 | 판정 |
|---|---|
| 절대 임계값 (예: ≥ 0.32) | 지금 데이터엔 딱 맞지만 모델을 바꾸면 깨짐 |
| kNN (지금) | 우연 엣지 강제 |
| 평균 중심화 (All-but-the-top / BERT-whitening) | **n=8에선 실패** — 평균이 곧 샘플이라 구조가 지워짐(cogs–designStudy 0.44 → −0.04). 수백 개부터 |
| **z-score: 평균 + 0.5σ 이상만, 미연결은 부유, 노드당 상한 없음 — 채택** | "이 코퍼스에서 평균보다 눈에 띄게 비슷한 쌍"이라는 뜻이 모델·글 수와 무관. sync 뒤 `build_edges`가 통계를 다시 잡으니 새 글이 들어오면 자동 재보정 |

지금 데이터로 z ≥ 0.5 → 엣지 8개: {designStudy, visualArt, cogs, smartfactory, gillSans} + {kmeans, handPose}, 둘 사이를 cogs–kmeans(0.31)가
잇고 quantum만 부유 — "미술 vs 코드"가 축 없이 데이터에서 저절로 갈린다. 처음엔 노드당 상한 3을 뒀지만 cogs–kmeans와 cogs–gillSans(둘 다 0.31)
중 하나를 정렬 순서로 자르는 자의적 컷이라 없앴다 — 허브도 정보(점 크기가 링크 수), 붐비면 `EDGE_Z`를 올린다. 가중치는 z의 고정 함수(z 0.5 → 0.15, z 3 → 0.85)라 모델을 바꿔도 굵기·스프링 길이 느낌이 유지.
실험 손잡이: `GET /api/chat/graph?z=1.0`. 프런트 오프라인 폴백(`data/retrieval.js`)도 같은 규칙.

**같은 날, 다시: z-score만으로는 "관련 있음"이 아니다.** z ≥ 0.5의 8개 엣지를 하나씩 보니 smartfactory–visualArt(0.33)·cogs–kmeans(0.31)는
사람이 보기에 관계가 없고, 진짜 관련인 ML 쌍(kmeans–handPose 0.32)과 0.01 차이라 어떤 절대값·z로도 갈라지지 않는다. z는 "이 코퍼스 평균보다
높다"일 뿐이라 무관한 글 8개를 넣어도 ~30%가 이어지고, 쌍이 n²으로 늘어 글이 많아지면 거미줄. 반대로 z를 1.0으로 올리면 ML 쌍이 떨어진다 —
요약 임베딩이 디자인 글끼리는 0.4–0.55, ML 글끼리는 0.32로 "느슨하게" 묻히는 편향.
→ **상호 kNN(k=2) ∩ z ≥ 0.5 — 채택.** "A의 최근접 2개에 B가 있고 B의 최근접 2개에도 A가 있을 때"만 잇는다(von Luxburg 2007의 스펙트럴
클러스터링 튜토리얼이 밀도가 다른 덩어리 분리용으로 권하는 mutual kNN 그래프; Jarvis–Patrick 1973의 SNN, 단일세포의 MNN 배치 보정
(Haghverdi 2018), k-reciprocal re-ranking(Zhong 2017)과 같은 계열). 순위 기반이라 모델·코퍼스 밀도와 무관하고 각 영역이 제 짝을 얻는다;
z 바닥은 순위가 관계를 지어내는 것(코퍼스가 커지면 생김)만 막는 ε-그래프 교집합. 결과: 디자인 삼각형 {designStudy, visualArt, cogs} +
ML 쌍 {kmeans, handPose}, smartfactory·gillSans·quantum은 부유 — 손으로 그려도 이 그림. 노드당 최대 2개, 엣지 수는 n에 비례.
손잡이: `?z=&k=` (k=0이면 z만). 위 "노드당 상한 없음" 결정은 이 규칙으로 대체됨(상한이 아니라 상호성이 자르므로 정렬 순서 컷이 아님).

결정된 것: 챗에 들어가면 그래프는 사라지는 게 맞다(읽는 공간). `simulation.injectQuery`/쿼리 노드 코드는 보이지 않는 캔버스에서 돌던
죽은 기능이라 삭제. 노드 크기는 전부 동일 — 링크 수는 유사도이지 중요도가 아닌데 크기는 중요도로 읽힌다.

**모양과 배치 (프런트, 같은 날)**
- 물리는 Obsidian 그래프 뷰 참고: 부드러운 원형 경계로 사각형 대신 원반, 낮은 마찰(`DAMP`)로 느린 정착,
  부유 노드는 중심 인력 ×3(`FLOAT_GRAVITY`)으로 가장자리 대신 덩어리 사이 빈자리에.
- **파라미터 정리(같은 날, 나중)**: 드래그 복귀가 계속 세게 느껴졌고 손잡이 9개(`REPULSION SPRING REST DAMP CENTER RADIAL DRIFT …`)가 서로
  얽혀 하나를 바꾸면 전부 흔들림. 1차원 계산으로 본 구조적 원인 둘 — ① 척력 5200 vs 중심 인력 0.0012의 자연 반지름 ≈ 326px인데
  띠의 원은 168px → 덩어리가 항상 2배로 압축돼 벽에 눌린 상태, 뭘 놓든 압축 스프링을 놓는 셈; ② 선형 스프링 0.014는 `DAMP` 0.86의
  임계감쇠 강성 0.006의 2배(이웃 3개면 7배)라 항상 튕기고, 300px 끌면 이웃 3개 기준 최고 2,180px/s.
  → 지각 기준 손잡이 4개로 축소, 나머지는 고정이거나 띠에서 유도: `SPACING`(링크 길이 = room 반지름 × 1.0 — 폰이든 데스크톱이든
  덩어리가 띠를 같은 비율로 채움), `FIT`(척력을 `CENTER·(FIT·room)³/n`으로 유도 → 과압 해소), `MAX_SPEED`(3px/frame = 180px/s —
  얼마나 멀리 끌든 같은 속도로 미끄러져 돌아오고 끝에 감속; 튕김 0~2%), `WOBBLE`(흔들림 진폭 px). 고정: `SPRING` 0.006(임계감쇠),
  원 밖 복귀도 같은 강성, `CENTER`·`DAMP`·`FLOAT_GRAVITY`. 라벨 겹침은 전체 척력이 아니라 근거리 충돌 항(중심 간 90px, 폰 48px, d3 forceCollide 격)으로 — 척력으로 풀면 다시 벽에 눌림. 결과 위/아래 여백 41/49(1440×900) 33/46 43/43 61/51(폰, 라벨 없음),
  놓은 뒤 최고 속도 3px/frame·정착 ~2.5초. 링크 길이가 room에 비례하므로 노드가 많아지면 `1/√n` 항이 필요(로드맵)
- 그래프 공간은 비율 추측(0.53H~0.66H)이 아니라 **측정**: `MapLayer`가 인트로 바닥과 독 꼭대기를 재서 시뮬레이션에 띠를 넘김.
  폰에선 인트로가 올라간 만큼 커지고 데스크톱에선 인트로 아래 죽어 있던 공간이 그래프로. 720px 이하는 라벨을 탭한 노드만 표시(11px 라벨 8개는 폰에 안 들어감)
- 세로 구성: 인트로 33% + 입력창 바닥(히어로 관례 + 챗 관례 반반)이라 위가 비고 아래가 붙었음 → 인트로·그래프 띠·입력창을 **한 덩어리로 광학 중심(49%)에**.
  `--band`(띠 높이 `clamp(240px, 38vh, 400px)`)를 축으로 인트로는 위에, 독은 아래에 앵커. 챗 진입 시 독만 대화창 바닥으로 슬라이드.
  LLM 앱 관례 확인: 대화 중엔 하단 16–24px 고정, 빈 화면은 그룹 중앙 정렬(ChatGPT·Claude·Perplexity) — 후자가 우리 랜딩
- 헤드리스 크롬은 최소 창 너비가 있어 390px 스크린샷이 왜곡됨 → 실제 뷰포트 확인은 iframe 래퍼로
- 그래프 위·아래 여백 비대칭(1440×900 잉크 기준 위 33px / 아래 60px). 원인 셋: ① 라벨은 점 위에만 붙는데 원 경계는 위아래 똑같이
  `LABEL_PAD`만큼 깎음 → 위 패딩은 라벨 높이, 아래는 점 반지름으로(컴팩트 모드는 라벨이 없으니 둘 다 점 반지름);
  ② 원을 띠에 내접시키니 위는 딱딱한 바닥에 평평하게 눌리고 아래는 둥글게 남음 → 원을 띠보다 `OVERSHOOT`(40px)만큼 크게 잡아
  위아래는 띠의 바닥/천장이 대칭으로 받치고 원은 옆만 둥글림; ③ **부유 노드의 3배 인력이 반작용 없는 힘**이라 덩어리 전체를 밀어
  인트로에 붙임(헤드리스 시뮬레이션 ablation: `FLOAT_GRAVITY=1`이면 정확히 중앙) → 초과분을 링크된 노드에 반작용으로 나눔.
  덩어리가 띠보다 작을 때(태블릿·폰)는 중력·원이 **무게중심**을 맞추는데 비대칭 덩어리는 무게중심 ≠ 상자 중앙 → 힘의 중심점을
  (무게중심 − 상자 중앙)만큼 옮겨(`FIELD_EASE`로 천천히) 평형에서 상자가 중앙에 오게. 노드마다 같은 오프셋이라 노드 간 상대 힘,
  즉 드래그 복귀 느낌은 그대로 — 상자를 맞추는 별도 힘(EXTENT)을 넣어 봤더니 놓은 노드까지 당겨 튕김이 세져서 폐기.
  결과 위/아래 20/25(1440×900), 20/21(1024×768), 29/37(768×1024), 46/36(390×844, 흔들림 ±10).
  측정은 CDP(`Emulation.setDeviceMetricsOverride` + 실시간 9초 + 픽셀 스캔) — `--virtual-time-budget` 스크린샷은 정착 전이라 못 믿음.
  힘 하나씩 끄는 ablation과 드래그-놓기 테스트(놓은 뒤 최고 속도·정착 프레임)는 `simulation.js`를 node로 바로 import해서 돌림

다음 고민: bio를 중앙 앵커 노드로(유사도로는 아무와도 안 붙으니 설계로), 태그 노드(정규화 먼저).


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

## 2.9 답변 품질 검수 — 프롬프트 A/B를 판정자로 재기 (2026-08-30)

검색은 골든셋으로 재는데 생성은 "프로빙해 보니 괜찮더라"였다. 관례대로 두 층으로 나눔: **근거성**(답의 주장 하나하나가 문서에 있는가,
RAGAS의 faithfulness)과 **선호**(어투·길이 적합·거절 처리 — 절대 점수는 흔들리므로 두 답을 나란히 놓고 고르는 pairwise, 순서는 섞어서
위치 편향 상쇄). `scripts/judge_answers.py`: 질문 24개(`scripts/eval_questions.json`, 후속 질문은 `prev`로 2턴) × 프롬프트 A/B를
운영 경로(retrieve → generate, 검색은 공유)로 답하고 Sonnet 5가 판정. Pydantic `messages.parse`로 구조화, 답은 판정 전에 저장(`--reuse`).
한 번에 ≈ $0.5.

**1차 실행 — "현재" vs "질문에 맞춘 길이"(사실 질문 1–2문장, 열린 질문 3–5문장 + 구체 하나, 거절 전에 있는 것 먼저, bio 복창 금지):**

| | current | adaptive |
|---|---|---|
| pairwise 승 | 9 | 10 (무승부 5) |
| 근거 없는 주장 | 4 | 5 |
| 평균 출력 토큰 | 88 | 87 |

길이 지시는 의도대로 작동 — 열린 질문(A1·A2·A7)은 +50~60%, 사실 질문은 같거나 짧아져 평균이 같음. 승패는 무승부 수준이라
**"길게"가 답이 아니었다.** 판정자의 근거를 읽으면 진짜 문제는 프롬프트 변형과 무관하게 양쪽에 다 있는 것들:
1. **해요체 일관성** — 4건(A4·A7·B8·E24)에서 습니다체가 섞임. 지시("consistently")만으론 부족, 어미 예시가 필요
2. **거절이 첫 문장** — C14·C15·C18 양쪽 모두. "먼저 있는 걸 한 문장" 지시가 안 먹힘 → 예시 한 쌍(bad/good)이 필요
3. **bio 복창** — E23 "building what's underneath them, including models" 그대로
4. **근거 없는 문장 유형** — 감상("직접 보고 느낄 수 있었어요"), 사이트 안내 추측("연락처는 푸터에 있을 것"), 일반화("타이포는 넓은
   디자인 실천과 이어진다"). 모두 **한 문장 더 보태려다** 생김 — 길이를 늘릴수록 커지는 비용
5. **구조적 공백** — E25 "List all your projects": 검색 top-4만 보이니 "네 개"라고 답하고 셋만 나열. 목록형 질문엔 제목 인덱스(작음)를
   항상 컨텍스트에 넣어야 함. C17 연락처: 푸터에 있는데 문서엔 없음 → bio에 넣을 것(내용 보강 목록)

다음 반복: 1·2·3을 프롬프트에 **예시로** 넣은 변형, 루브릭을 주인의 말로 다시 쓰기(판정자 기준 = 페르소나 명세). → §2.11

**5 해결(같은 날)**: 주입 대신 코퍼스에 **생성 인덱스 문서**(§1 `src/content/` 항목) — E25가 'All projects' 1위로 8개 전부 나열.
골든셋 재측정 hybrid EN 12/12 · KO 12/14 13/14 · FU-A 7/7 · B 5/5 · D 1/2 — 인덱스 없는 코퍼스로 같은 코드를 돌려도 동일하므로 인덱스의
영향은 0. (§2.6 표의 KO 13/14 · D 2/2는 그 뒤 어느 변경에서 12/14 · 1/2로 내려온 상태 — "타이포그래피 작업 있어?"→cogsAndGears,
"Which one was fastest?"→kmeans. 원인 추적은 별도 항목.)

## 2.10 검색용 질문 재작성 — 교차언어 RAG의 나머지 반쪽 (2026-08-30)

코퍼스는 영어 청크뿐(`build-corpus`가 `<Lang locale="en">`만 취함), 임베딩은 다국어. 한국어 질문은 의미로는 영어 청크를 찾지만
**키워드 절반(BM25/tsvector)이 죽고**, 생략된 후속 질문은 앵커 제목으로 주제만 되찾을 뿐 빠진 단어는 못 채운다. 2026년 관례는
다국어 임베딩(지금) + **피벗 번역**(질문을 영어 독립 질문으로 재작성해 검색)의 하이브리드 — LangChain의 condense-question 프롬프트
("follow up question → standalone question")가 원형이고, 우리는 거기에 영어로의 번역과 "새 주제면 이전 주제를 끌어오지 말 것"을 더함.

`chat/rewrite.py`: `search_query(question, history)` — 조건에 맞으면 Haiku 1콜(≈0.5초, max 80 토큰)로 재작성, 아니면 원문.
**검색에만** 쓰고 답변 생성은 방문자의 원문으로(오역이 답에 스며들지 않게). 실패·타임아웃(6초)·키 없음 → 원문으로 폴백.
조건: 한글이 있거나, 영어 후속 중 참조어(it/that/this/more/which…)가 있을 때. 영어 첫 질문(대부분의 트래픽)은 호출 0.

측정에서 배운 것 세 가지 — 프롬프트를 두 번 고쳤다:
1. 처음 프롬프트는 "search query"라고 해서 **키워드 조각**("XGBoost experience", "about page")이 나왔다. bio의 passage는 질문형
   ("Who are you? …")이라 "about page"로는 못 찾고, 주제 전환 케이스(FU-B) 5/5 → 3/5. → "방문자가 다 풀어 썼을 완전한 영어 질문 한 문장"으로.
2. 영어 후속을 전부 재작성하니 "Have you used XGBoost?"에 이전 주제(양자)가 섞였다. 프롬프트에 "새 주제면 섞지 말 것"을 넣고,
   **참조어 없는 영어 후속은 아예 재작성하지 않음** → FU-B 5/5 복구.
3. 인덱스 문서(§1)가 영어 재작성 질문의 키워드를 훔쳤다("Have you made anything with Blender?" → 본문에 모든 excerpt가 있던 인덱스).
   본문을 제목·연도만으로, 요약을 "Index of project titles (for listing or counting)"으로 — "무엇을 만들었나"의 답처럼 읽히는 요약이
   프로젝트 자체를 이겼기 때문.

| hybrid (configured model) | EN r@1 | KO r@1 r@4 | FU-A | FU-B | FU-D | ms/q |
|---|---|---|---|---|---|---|
| 재작성 없음 | 12/12 | 12/14 13/14 | 10/11 | 5/5 | 1/2 | 1 |
| **+ 재작성** | 12/12 | **14/14 14/14** | **11/11** | 5/5 | **2/2** | ~500 (재작성 호출 포함) |

**앵커의 자리(같은 날, 나중)**: 재작성 도입 후 골든셋 B("양자 → Have you used XGBoost?")가 글 몇 단어 바뀌는 것으로 뒤집혔다 —
앵커 제목을 붙인 두 번째 dense 질의가 양자 문서를 0.647까지 올려 정답(0.29 + 키워드 0.1)과 0.005 차이. 재작성이 주제를 이미 문장에
넣어 주므로 앵커는 **재작성이 필요했는데 못 받았을 때의 폴백으로만**(`rewrite.search_plan` → (query, anchor)): 재작성됨 → 앵커 없음,
참조어 없는 영어 새 질문 → 앵커 없음, 한국어인데 모델 실패 → 원문 + 앵커. 결과 EN 12/12 · KO 14/14 · A 11/11 · B 5/5 · D 2/2.

**글 표현 실험(같은 날)**: kmeans 포스트 두 섹션의 영어 첫 문장에 독자가 묻는 말을 자연스럽게 넣음("…the four initialization methods you
meet most often — Random, Farthest First, KMeans++ and Manual", "…two cases where KMeans itself doesn't work well…"). 청크 기대치 c1/3 → c2/3
(재작성 문구 변동으로 실행마다 ±1). 검색 규칙 세 번 바꿔서 안 되던 것이 문장 하나로 움직였다 — 가설 확인.

**인덱스 문서의 자리(같은 날, 마지막)**: PG 경로에서 "타이포그래피 작업 있어?"·"블렌더로 만든 거 있어?"의 1위를 인덱스가 계속 뺏었다.
원인 둘 — 재작성 질문의 "project"가 키워드 검색에서 인덱스(제목·"projects" 반복)를 올림: "project/projects/site/portfolio"는 거의 모든 청크
머리말(`From {title} (project; tags)`)에 있어 검색어로서 정보가 0 → 도메인 불용어로. 그리고 인덱스는 **열거 질문에만** 후보여야 함
(`retrieval.is_enumeration`: list/all/every/how many/what have you made/전부/목록/몇 개…) — 그 외 질문에선 순위에서 제외. 양쪽 경로 모두
EN 12/12 · KO 14/14(PG 13/14, 재작성 문구 변동) · A 11/11 · B 5/5 · D 2/2.

**프롬프트 v2(외부 리뷰 반영, 같은 날 마지막)**: 리뷰 7항목 중 실측으로 걸러 넣은 것 — `NO_RETRIEVAL` 센티넬(인사·감사·횡설수설·
어시스턴트 향한 지시는 검색 생략, bio만 컨텍스트), "대화에 없는 조건 덧붙이지 말 것", 주입 방어 한 줄, few-shot 5개. few-shot은 **프레이밍 주의**:
처음 넣은 예시("손동작 인식은 어떤 모델로 했어요?" → "Which model was used for…")가 맨 키워드 질문("실시간 손동작 인식")에 그대로 덧씌워졌다 →
예시는 방문자 말에 단어를 더하지 않는 것만(인사 / 평범한 한국어 질문 / 맨 키워드 / 참조 해소 / 주제 전환 / 자기소개), 골든셋 문장 재사용 금지.
센티넬은 좁게: "너는 누구야?"·맨 키워드가 NO_RETRIEVAL로 빠지던 걸 규칙에 명시("about 질문·맨 키워드는 검색"). 리뷰의 나머지 — 128토큰 절단
(실측: 400단어 붙여도 벡터가 계속 변함, fastembed 512·청크 최대 358단어 → 해당 없음), 평서형 질의(대칭 paraphrase 모델 논거; A/B: 의문문 KO 13/14 vs
평서형 12/14 — bio passage가 질문형이라 의문문이 유리, 채택 안 함), 멀티쿼리+RRF(9개 문서에서 RRF가 평평해지는 걸 §2.6에서 봄, r@4 이미 만점),
3인칭 정규화(문서가 1인칭), HyDE(지연) — 근거 없어 보류. 프롬프트 형태 A/B는 `rewrite.SYSTEM_PROMPT`를 바꿔 `eval_retrieval --rewrite`로.

**답변 모델에 주는 주제(같은 날)**: 생성 프롬프트의 "(이전 답은 X에 관한 것)" 힌트는 이전 턴의 **1위 소스** 제목이었는데, 1위가 틀리고
답은 2위 문서로 나간 경우("블렌더로 만든 거 있어?" → 1위 Smart Factory, 답은 Cogs and Gears) 다음 "그건 어떻게 만들었어?"가 Smart Factory로
설명됐다. 재작성이 참조를 해소하며 프로젝트 제목을 문장에 넣으므로 **재작성 질문에 등장한 제목을 주제로**(`service.topic_named`), 이전 1위는 폴백.
열거 단서에서 "what/which projects"는 뺌 — "What projects were made using Blender?"는 목록 질문이 아니다.

남은 것 둘. **① 인용 청크**: 문서는 맞는데 "초기화 방법은?"에 본문 첫 단락이 인용됨(골든셋 `chunk` 기대치 c1/3). 세 가지를 시도 —
키워드 질의에서 앵커 제목 단어 제거(`hybrid.keyword_query`, 제목은 모든 청크 passage에 있어 청크 선택에 정보가 0 — 무해해서 유지),
키워드 색인에서 요약 청크 제외(본문 없는 문서를 못 찾아 EN 12→11 — 되돌림), 1위 문서만 본문 청크 중 재선택(지표 불변 — 되돌림).
청크별 점수를 찍어 보니 'Four ways to start' 섹션은 BM25·코사인 모두 6개 중 꼴찌: 본문이 "initialization method" 대신 "ways to seed"라고
써서 질문 단어와 안 맞는다. **검색 규칙이 아니라 글의 표현 문제** — 섹션 첫 문장에 독자가 묻는 말("the four initialization methods")을
쓰는 게 정공법(post-writing-guide에 반영), 코드 쪽 대안은 리랭커나 상위 청크 2개 인용. **② 인덱스 문서의 1위 탈취 변동**: 재작성 문구가
매번 조금 달라("Do you have any projects made with Blender?") 인덱스가 1위, 정답 2위가 되는 케이스가 실행마다 0~2건(PG 경로 KO r@1 11~14/14).
top-4엔 있어 답은 맞지만, 근본은 인덱스 요약이 "무엇을 만들었나" 질문과 닮은 것 — 덜 질문 같은 passage 또는 목록 단서가 있을 때만
후보로 두는 규칙이 다음 손잡이. 골든셋에 한국어 생략 후속 4건과 `chunk` 기대치 필드를 추가했고, `eval_retrieval.py --rewrite`가 재작성
전/후를 나란히 낸다. 재작성은 temperature를 못 정하므로(SDK 1.x에서 인자 제거) 실행 간 ±1건 변동이 정상.

## 2.11 답변 프롬프트 v2 → v3 — 페르소나 명세를 프롬프트로, 판정으로 검증 (2026-08-30)

주인이 쓴 보이스 가이드(청중·해요체 어미 목록·맞춤법·결론 먼저·2–4문장·과장어 금지·미기재 템플릿·사생활 거절·AI 고지)를 거의 그대로
시스템 프롬프트로 옮기고 `judge_answers`로 쟀다. 루브릭도 같은 기준으로 다시 씀(`DEFAULT_RUBRIC`), 질문 3개 추가(AI 고지·일본어·연락처, 27문항).
빼거나 바꾼 것: 접속어 목록("사실/일단/그런데" — 매 답 첫머리에 기계적으로 붙는 부작용), 리스트 허용(채팅은 플레인 텍스트 렌더),
"retrieved context below"(문서는 user 턴의 `<documents>`).

| | v1(기존) | v2 | v3 | v3 + CV 문서 |
|---|---|---|---|---|
| pairwise 승 (27) | 11 / 4 / 6 | 14 | 17 | **18** (무 3) |
| 톤 승 | 3 / 0 / 0 | 9 | 12 | 8 (무 19) |
| 근거 없는 주장 | 4 / 8 / 5 | **28** | 7 | 5 |
| 평균 출력 토큰 | 82 / 81 / 87 | 90 | 67 | 67 |

**v2가 가르쳐 준 것 — 보이스 지시는 근거성을 갉아먹는다.** 승률은 올랐는데 근거 없는 주장이 7배: 감정("felt like a real shift"), 분류
("typeface design" — Gill Sans는 스톱모션 영상), 일반 지식("일반적으로 k-means는…"), 태그 부풀리기("Blender로 3D geometry를"), 사이트
안내 추측("왼쪽에 프로젝트 링크"). 전부 "2–4문장 + 구체 하나 + 자기 말로"가 **문서가 얇을 때 문장을 채우려다** 생긴 것 — §2.9의 관찰 4와 같은
메커니즘. v3는 근거 절을 맨 앞에 두고 하지 말 것을 유형별로 열거(특징짓기·일반 지식·태그 확장·문서에 없는 장소 안내)하고 "문서가 한 문장이면
한 문장으로, 채우는 것보다 짧은 게 낫다"를 명시 — 그러자 평균 길이가 오히려 줄면서(87→67) 승률이 올랐다. **"짧고 무뚝뚝하다"의 해법은 길이가
아니라 어투였다.** 판정관은 프롬프트가 준 사실(AI 고지, 언어)을 문서에 없다고 세므로 `GIVEN` 블록으로 알려 줌.

v3에서 잡은 둘. ① "Who are you?"가 스마트 팩토리 후속으로 오면 v3가 **직전 자기 답을 부정**("그런 프로젝트는 여기 없어요") — 원인은 서버 힌트
"(This is a follow-up; the previous answer was about X.)"가 주제 전환 질문에도 붙어 엄격해진 모델이 X를 언급해야 한다고 느낀 것. 힌트를 조건문
"(If the question says it/that, it means X.)"으로 바꾸고 "이전 답도 그때 문서에 근거한 것, 부정하지 말 것"을 추가. ② 연락처 규칙 — 처음엔
"페이지 구석의 이메일·GitHub 링크로 안내"였는데 그 문구가 무관한 답에 새고(A7), CV 문서가 생기자 문서 내용과 섞여 "LinkedIn이 구석에" 같은
오답이 됨. 규칙은 "문서에 적힌 연락처를 주소 그대로, 없는 주소는 지어내지 않기" 한 줄로 축소. 그런데도 "CV에 있어요"라고 위치만 말한 이유는
검색 쪽 — CV 문서가 **요약 청크로만** 인용돼 컨텍스트에 주소가 없었다(§2.10 ①과 같은 "요약이 본문 섹션을 이김"). 요약을 짧게, 본문 첫 문장을
"The best way to contact me is email: …"로 바꾸니 'How to contact me' 청크가 인용되고 EN·KO 모두 주소를 그대로 답한다.

해요체 슬립: v1은 매 실행 3–4건(있습니다·했습니다·가능합니다), v3는 전 실행 0건 — 어미 목록 + "every sentence ends in ~요"를 프롬프트 맨 끝에
두는 것으로 충분했다. 남은 근거 없는 주장 5건은 AI 고지·거절 문장·"I think"류 — 실질 오류 아님.

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
- [x] **P2-6** 그래프 엣지 z-score 임계값 + 부유 노드 (§2.8) — 2026-08-29
- [ ] **P2** `relations` 선언 엣지 + 그래프 표시 구분
- [x] **P3 → 완료 2026-08-29** 한국어 질문 대응 — 골든셋 실측 후 **multilingual-MiniLM-L12 int8**로 교체
      (KO recall@4 64%→93%, EN 100% 유지, +354MB). `chat/embedding.py` 커스텀 등록, `scripts/eval_retrieval.py` 편입.
      배포 전 arm64 실측(§2 임베딩 배치): 백엔드 575 MB — 스왑 없이 들어감, bge-small 회귀 불필요
- [ ] **P3** 리랭커 (fastembed rerank) — 검색 품질 문제가 실측되면
- [x] **P2-3** 후속 질문 1단계: 골든셋 `followup` + 제목 앵커 가중 RRF — 2026-08-29 (§2.5)
- [x] **답변 프롬프트 v3 — 2026-08-30** 주인의 보이스 가이드를 프롬프트로, 판정 18/6/3, 해요체 슬립 0, 근거 없는 주장 유지 (§2.11).
      다음: 배포 후 실제 로그의 질문으로 `eval_questions.json` 보강, 루브릭은 판정 근거를 읽으며 다듬기
- [x] **P3 → 완료 2026-08-30** 질문 재작성 (`chat/rewrite.py`): 한국어 또는 참조어가 있는 영어 후속 → 독립 영어 질문으로 검색. 골든셋 KO 12→14/14, FU-A 10→11/11, FU-D 1→2/2 (§2.10)

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
