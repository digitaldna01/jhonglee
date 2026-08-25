"""Content repository — the corpus.json loader.

The mdx posts in fe_src are the single source of truth; `npm run corpus`
(fe_src/scripts/build-corpus.mjs) extracts their frontmatter + English
prose into corpus.json, committed next to this module. Read-only,
loaded once at import. Each doc:

  id, kind (project|post|bio|…), title, date, year, lean, tags, stack,
  summary   — what answers quote (the post's excerpt)
  url       — the post page, or None for corpus-only docs
  chunks    — [{id, heading, text}] section chunks of the body
  node      — whether it appears on the landing graph
"""
from __future__ import annotations

import json
from pathlib import Path

_CORPUS_PATH = Path(__file__).with_name("corpus.json")

with _CORPUS_PATH.open(encoding="utf-8") as f:
    _payload = json.load(f)

DOCS: list[dict] = _payload["docs"]
NODES: list[dict] = [d for d in DOCS if d["node"]]
BIO: dict = next(d for d in DOCS if d["kind"] == "bio")

_BY_ID = {d["id"]: d for d in DOCS}


def by_id(doc_id: str) -> dict | None:
    return _BY_ID.get(doc_id)
