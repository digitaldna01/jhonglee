"""Corpus → vector store sync (incremental).

Every corpus chunk becomes a passage with a content hash:

    hash     = sha256(embed_model + "\\n" + passage)
    chunk id = "{doc_id}#{hash[:12]}"

so a chunk is re-embedded only when its text — or the embedding model —
changes, and chunks that vanished from the corpus are deleted. Runs at
startup (lifespan → retrieval.warmup) and by hand:

    python -m app.chat.ingest        # inside the backend container / venv
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from ..content.repository import DOCS
from .store import ChunkRow, VectorStore

log = logging.getLogger(__name__)

EmbedFn = Callable[[list[str]], np.ndarray]  # passages → (n, dim)


@dataclass(frozen=True)
class SyncReport:
    added: int
    removed: int
    unchanged: int
    seconds: float

    def __str__(self) -> str:
        return (
            f"rag index: +{self.added} chunks embedded, -{self.removed} removed, "
            f"{self.unchanged} unchanged ({self.seconds:.1f}s)"
        )


def passage_text(doc: dict, text: str) -> str:
    """Contextual-embedding template: the frontmatter is the chunk's context."""
    if doc["kind"] == "bio":
        # question-shaped surface so "who are you?"-style queries land here
        return f"Who are you? Who is Jae Hong Lee? About me: {text}"
    tags = ", ".join(doc["tags"])
    return f"From {doc['title']} ({doc['kind']}; {tags}): {text}"


def plan(model: str, docs: list[dict] | None = None) -> list[ChunkRow]:
    """The chunk rows the store *should* contain for this corpus and model."""
    rows: list[ChunkRow] = []
    for doc in docs if docs is not None else DOCS:
        # synthetic summary chunk first, so a doc is findable even with a thin body
        pieces = [(None, doc["summary"], True)] + [
            (c["heading"], c["text"], False) for c in doc["chunks"]
        ]
        for heading, text, is_summary in pieces:
            passage = passage_text(doc, text)
            h = hashlib.sha256(f"{model}\n{passage}".encode()).hexdigest()
            rows.append(
                ChunkRow(
                    id=f"{doc['id']}#{h[:12]}",
                    doc_id=doc["id"],
                    heading=heading,
                    text=text,
                    passage=passage,
                    hash=h,
                    is_summary=is_summary,
                    model=model,
                )
            )
    return rows


async def sync(
    store: VectorStore,
    embed: EmbedFn,
    model: str,
    docs: list[dict] | None = None,
) -> SyncReport:
    t0 = time.perf_counter()
    docs = docs if docs is not None else DOCS
    desired = plan(model, docs)
    desired_ids = {r.id for r in desired}
    existing = await store.existing_chunk_ids()

    new_rows = [r for r in desired if r.id not in existing]
    stale = existing - desired_ids

    new_chunks: list[tuple[ChunkRow, np.ndarray]] = []
    if new_rows:
        vecs = await asyncio.to_thread(embed, [r.passage for r in new_rows])
        new_chunks = list(zip(new_rows, vecs))

    await store.apply(docs, new_chunks, stale)
    return SyncReport(
        added=len(new_rows),
        removed=len(stale),
        unchanged=len(desired_ids & existing),
        seconds=time.perf_counter() - t0,
    )


async def _main() -> None:
    from . import retrieval

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    report = await retrieval.warmup()
    print(report)


if __name__ == "__main__":
    asyncio.run(_main())
