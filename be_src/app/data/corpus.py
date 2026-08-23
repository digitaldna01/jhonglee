"""Portfolio knowledge corpus — loaded from the generated corpus.json.

The mdx posts in fe_src are the single source of truth; `npm run corpus`
(fe_src/scripts/build-corpus.mjs) extracts their frontmatter + English
prose into corpus.json, which is committed next to this module. Each doc:

  id, kind (project|post|bio), title, date, year, lean, tags, stack,
  summary   — what answers quote (the post's excerpt)
  chunks    — [{id, heading, text}] section chunks of the body
  node      — whether it appears on the landing graph
"""
from __future__ import annotations

import json
from pathlib import Path

_CORPUS_PATH = Path(__file__).with_name("corpus.json")

with _CORPUS_PATH.open(encoding="utf-8") as f:
    _payload = json.load(f)

KNOWLEDGE: list[dict] = _payload["docs"]
NODES: list[dict] = [d for d in KNOWLEDGE if d["node"]]
BIO: dict = next(d for d in KNOWLEDGE if d["kind"] == "bio")

_BY_ID = {d["id"]: d for d in KNOWLEDGE}


def by_id(doc_id: str) -> dict | None:
    return _BY_ID.get(doc_id)
