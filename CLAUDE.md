# jhonglee.com

개인 포트폴리오. 포스트(MDX)가 사이트 페이지·WORK 카드·랜딩 지식 그래프·RAG 챗 코퍼스를 한 번에 만든다.
Raspberry Pi 4(arm64, RAM 2 GB) 위 Docker Compose로 self-host. 구조·API는 `README.md`, `be_src/README.md`.

```
fe_src/   React 18 + Vite + MDX, Tailwind 4 (+ nginx /api 프록시)
          src/posts/*.mdx · src/content/*.md  ← 콘텐츠의 유일한 원본
be_src/   FastAPI · Postgres(pgvector + tsvector) · Redis · Alembic — 콘텐츠 API, RAG 챗(SSE), 데모 API
docs/     살아 있는 결정 기록 — backend-architecture.md(규칙), rag-design-notes.md(검색 설계)
```

## 명령

| 할 일 | 명령 |
|---|---|
| 개발 스택 (보통 이미 떠 있음) | `docker compose -f docker-compose.dev.yml up --build` → http://localhost:5173 (백엔드 :8000) |
| 백엔드 테스트 | `cd be_src && .venv/bin/python -m pytest -q` — 약 2분 30초 (임베딩 모델 로드). 관련 파일만 돌리려면 `tests/test_<x>.py` |
| 프론트 lint | `cd fe_src && npm run lint` — 깨끗한 상태가 기준 |
| 코퍼스 재생성 | `cd fe_src && npm run corpus` — 포스트를 고친 뒤. 결과물 두 개는 gitignore, CI가 배포 때 다시 만든다 |
| 검색 회귀 확인 | `cd be_src && PYTHONPATH=. .venv/bin/python scripts/eval_retrieval.py --rerank` (골든셋) |
| 스크린샷 | `node fe_src/scripts/screenshot.mjs <url> <out.png> [--width N --click SEL --eval EXPR --scroll --desktop]` |
| 포스트 기계 검사 | `python3 .claude/hooks/check_post.py [file.mdx]` (편집할 때마다 훅으로도 돈다) |

## 브랜치와 배포

- **로컬 체크아웃은 항상 `develop`.** 개발 Docker가 이 트리를 bind mount로 서빙한다.
  브랜치를 바꾸면 실행 중인 Vite가 MDX 변환을 잃고 복구되지 않는다 → 다른 브랜치가 필요하면 `git worktree add`.
  (훅 `guard_git.py`가 막는다. 어쩔 수 없이 바꿨다면 `docker compose -f docker-compose.dev.yml restart web`.)
- **`main`은 PR로만 바뀐다**(enforce_admins). 머지 = 배포(GHCR 빌드 → Pi의 self-hosted runner). 릴리스는 `/release` 스킬.
- **커밋은 주인이 말할 때만.** 문장을 다듬는 중엔 수정이 계속 이어진다. 수정마다 커밋하지 말고 모아서.
- 커밋 메시지: 기존 로그 형식 — `<영역>: <무엇을, 왜>` 한 줄 요약 뒤 세부를 이어 쓴다. Co-Authored-By 트레일러는 넣지 않는다.

## 코드 규칙

- 백엔드 규칙은 `docs/backend-architecture.md` "규칙" 절이 정본. 핵심: 라우터는 HTTP만, 로직은 `service.py`;
  기능 간 호출은 상대 기능의 `service.py`로만; 저장은 `core.cache`/`core.db` 인터페이스 뒤에.
- **모듈이 커지면 같은 이름의 패키지로.** `retrieval.py` → `retrieval/{__init__,hybrid,…}.py`, `__init__`이 재노출해서
  `from .retrieval import retrieve`가 그대로 동작하게. `retrieval2.py`, `*_utils.py` 같은 새 형제 파일 금지. 프론트도 같음
  (`pages/Post.jsx` → `pages/Post/index.jsx`).
  - 파일을 폴더로 바꾼 뒤 dev Vite는 옛 해석을 캐시한다 → import하는 파일을 `touch`(또는 `restart web`)하고 나서 화면을 믿을 것.
    CSS side-effect import(`import '../x.css'`)는 `from`이 없어서 `from '../` 치환에 안 걸린다.
- **문서는 변경의 일부.** `README.md`, `be_src/README.md`, `docs/*.md`를 코드와 같은 커밋에서 맞춘다.
  결정이 바뀌면 docs에 날짜와 함께 기록. 추정치가 아니라 실측값(메모리, 시간, 차원)을 적는다.
- **규모에 맞게.** 이 사이트 트래픽에 맞는 가장 단순한 정책을 고르고, 더 엄격하게 바꿀 때 한 줄이면 되는 구조만 남긴다
  (예: `be_src/app/chat/conversation/policy.py`). 내 제안이 과했으면 과했다고 말한다.
- **메모리가 제약.** Pi 2 GB에 OS·dockerd·runner·Postgres·Redis·임베딩 모델이 같이 산다. 컨테이너나 모델을 더하기 전에
  arm64 이미지로 prod compose를 로컬에서 띄우고 `docker stats`로 실측한다. compose `mem_limit`은 유지.

## 프론트 / 디자인

- **강조색은 잉크 블루 하나.** 토큰은 `fe_src/src/index.css`(`--accent`, `--accent-2`, `--accent-fill*`, `--ground-2`, `--mat`).
  두 번째 색조를 들이지 않는다. 얇은 것은 `--accent`, 채운 컨트롤은 `--accent-fill`. 원칙: 페이지는 비우고 이미지만 채도를 가진다.
- 모바일 레이아웃 확인은 `screenshot.mjs --width 390`(CDP 기기 에뮬레이션). 헤드리스 Chrome의 `--window-size`는
  약 500px 아래로 안 내려가서 잘린 이미지가 가짜 오버플로처럼 보인다.
- 터치 기기에선 탭 뒤 `:hover`가 고정된다. hover 전용 UI는 `@media (hover: none)`으로 처리.

## 포스트

포스트 작업은 `/post` 스킬을 따른다(형식, 이중 언어, 데모 세 형태, 다 쓴 뒤 절차). 요점만:

- 영어 블록이 RAG 정본(코퍼스는 `<Lang locale="en">`만 읽는다). 섹션 제목은 `###`만, 청크 경계가 된다.
  섹션 첫 문장은 독자가 물을 단어로 쓴다.
- 이미지·영상·데모 앞에서 "감상하시죠", "같이 보시죠"처럼 소개하지 않는다. 문장을 끝내고 작업물을 그냥 놓는다.
- 한국어 검수는 `ko-reviewer` 에이전트, 영어는 `claude-blog:blog-analyze`(Content Quality 항목만 유효. 이 SPA엔 SEO·스키마·OG가 해당 없다).
- 새 글이 기존 골든셋 질문의 검색 결과를 빼앗지 않는지 확인한다(새 글이 있을 때와 없을 때를 비교).
- 사실은 주인의 것이다. 경력·작업·사진 선택을 지어내지 않는다. 주인의 직함은 software engineer다("design engineer" 아님).

## 로컬 전용 맥락

`CLAUDE.local.md`(gitignore)가 있으면 그것도 읽는다: `_private_notes/`(글쓰기 가이드, 할 일, Pi 장비 문서)와
`v2-design-handoff/DESIGN_RULES.md`(색 규칙집)의 위치와 운영 메모. 두 폴더 모두 gitignore라 저장소에는 없다.
