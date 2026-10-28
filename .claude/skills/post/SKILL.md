---
name: post
description: Write, edit, or ship a blog/project post in fe_src/src/posts/*.mdx — frontmatter, EN/KO structure, images, interactive demos, and the after-writing checks (corpus, golden set, graph, EN/KO review). Use for any new post, post rewrite, or demo built for a post.
---

# Posts

One `fe_src/src/posts/<slug>.mdx` makes four things at once: the page, the WORK card, a landing-graph
node, and RAG chunks. Getting the format right is getting all four right.

**Read first, if present:** `_private_notes/2026-08-30-post-writing-guide.md` (the full format rulebook)
and, for Korean, `_private_notes/2026-09-01-korean-writing-guide.md`. They are gitignored; on a fresh
clone use the newest existing post as the reference instead (`ls -t fe_src/src/posts`).

## Who decides what

The owner supplies the facts, the photos and the final wording. Draft, propose, review — don't invent
experience, results, dates or quotes. Dates come from the owner's source material (lecture notes,
commits), not today's date. While the owner is revising text, don't commit (see CLAUDE.md).

## Shape

```mdx
---
title: Short Title                 # card, graph, chat citation (English)
displayTitle: { en: …, ko: … }     # optional long page title
date: '2024-10-04'                 # quoted
category: PROJECTS | POST
subcategory: logical | visual | blog | gallery     # = WORK filters
medium: figure | artwork           # figure: uncropped on a plate · artwork: 4:3 fill, cropped
thumbnail: /images/projects/<slug>/cover.png        # ≥1200px wide
excerpt: >-                        # card + chat summary, ≤ two sentences
keywords: [ … ]
lean: ml | design | research | art
stack: A · B · C                   # optional; rendered in the meta line — don't repeat it in the body
locales: [en, ko]
defaultLocale: en
---
```

- Sections are `###` only (`#####` for small labels). Each `###` is also a RAG chunk boundary and its
  heading — make the **first sentence of a section use the words a reader would ask with**.
- Bilingual: per section, `<Lang locale="en">…</Lang>` then `<Lang locale="ko">…</Lang>`, the `###`
  inside each block. Images, demos, code, `---` go **outside** Lang blocks, once.
- English is canonical for retrieval (the corpus reads only the EN blocks); code and math are stripped
  from the corpus, so never explain something only in code.
- Korean emphasis is `*별표*` (`_밑줄_조사` doesn't render); `*용어*(원어)` not `*용어(원어)*조사`.
- Images: `alt` becomes the caption, so write a sentence. Multi-image patterns: `media-duo`, `media-duo golden`,
  `media-trio`, `media-strip` (+ `crop`, + `wide`). Originals ≥1200px so the lightbox can enlarge.
  Files go in `fe_src/public/images/projects/<slug>/`.
- No emcee lead-ins before an artifact ("감상하시죠", "같이 보시죠", "~부터 볼게요"). End the prose; place the
  artifact. Instructions for an interactive piece are fine ("슬라이더를 움직이면…").

## Demos — pick the cheapest form that works

1. **Static artifacts + browser compute** (svdCompression, svdFeatures): `fe_src/scripts/build_<name>_demo.py`
   bakes arrays (int16/uint8) into `fe_src/public/demos/<name>/`, committed; the component fetches and computes.
   No backend, no CI step. Right when artifacts are a few hundred KB and the math is matrix-multiply sized.
2. **Offline artifacts + thin serving** (lsaSearch): built in CI (hash-keyed cache), gitignored, the backend
   serves with numpy only. For tens of MB or a model the browser can't hold. Budget the Pi's RAM first.
3. **Backend API** (kmeans): the server computes per request.

Build scripts run with `be_src/.venv/bin/python` and are deterministic. Component root gets `not-prose`;
place it outside Lang blocks right after the paragraph it illustrates. Demo photos are the owner's pick.

## After writing

1. `python3 .claude/hooks/check_post.py fe_src/src/posts/<slug>.mdx` — frontmatter, headings, missing files,
   Korean rendering traps, dashes, repeated endings. (Also runs on every edit as a hook.)
2. `cd fe_src && npm run corpus`. If the post's RELATED graph doesn't show locally, the backend still holds the
   old corpus: `docker compose -f docker-compose.dev.yml restart backend`.
3. **Golden set, with and without the post** — a new post must not steal other questions' retrieval
   (lsaSearch's "compare at query time" once did):
   ```bash
   cd be_src
   PYTHONPATH=. .venv/bin/python scripts/eval_retrieval.py --rerank > /tmp/with.txt
   cp app/content/corpus.json /tmp/corpus.full.json
   python3 -c "import json,sys; d=json.load(open('/tmp/corpus.full.json')); d['docs']=[x for x in d['docs'] if x['id']!=sys.argv[1]]; json.dump(d,open('app/content/corpus.json','w'))" <slug>
   PYTHONPATH=. .venv/bin/python scripts/eval_retrieval.py --rerank > /tmp/without.txt
   cp /tmp/corpus.full.json app/content/corpus.json
   diff /tmp/without.txt /tmp/with.txt
   ```
   Report the difference; "identical" is the goal. If a run dies midway, `npm run corpus` restores the
   real corpus.json. Ask a couple of real questions in the chat too.
4. Look at where the new node lands in the landing graph. A node floating alone means the excerpt/keywords
   are too thin or too unusual.
5. Review: EN with `claude-blog:blog-analyze` (only Content Quality applies to this SPA — ignore SEO/schema/OG);
   KO with the `ko-reviewer` agent. Show the owner the proposed edits; apply what they accept.
6. Cross-references between posts must not assume a reading order (both posts should read correctly alone).

## Commit message (when the owner asks)

Follow the log: `<slug>: <what the post is, in one clause> — <the decisions worth remembering: data source,
artifact size, what was reviewed and how, the date's source>`. Releases go out with `/release`.
