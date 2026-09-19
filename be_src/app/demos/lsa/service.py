"""LSA search over 20 Newsgroups — numpy-only serving half.

scripts/build_lsa_demo.py did the fitting (TF-IDF + truncated SVD); this
module only replays sklearn's *transform* for a query and takes dot products:

    tokenize → count vocabulary hits → weight by idf → project with the SVD
    components → L2-normalize → cosine against the precomputed doc vectors

Tokens outside the 20k vocabulary (stopwords included — they were never in
it) drop out on lookup, which is exactly what TfidfVectorizer.transform does.
Arrays are ~16 MB of float32 loaded lazily on first use; document snippets
stay in SQLite and only the top hits are read per query.
"""
from __future__ import annotations

import re
import sqlite3
import threading
from pathlib import Path

import numpy as np

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
TOP_K = 5

# sklearn's default token_pattern, lowercased input
_TOKEN = re.compile(r"(?u)\b\w\w+\b")

_state: dict | None = None
_load_lock = threading.Lock()


def available() -> bool:
    return (ARTIFACTS / "lsa.npz").exists() and (ARTIFACTS / "docs.sqlite").exists()


def _load() -> dict:
    global _state
    with _load_lock:
        if _state is None:
            data = np.load(ARTIFACTS / "lsa.npz")
            _state = {
                "vocab": {term: i for i, term in enumerate(data["vocab"])},
                "idf": data["idf"],
                "components": data["components"],  # (dims, vocab)
                "doc_vectors": data["doc_vectors"],  # (n_docs, dims), L2-normalized
                "categories": [str(c) for c in data["categories"]],
            }
    return _state


def _snippets(doc_ids: list[int]) -> dict[int, tuple[int, str]]:
    db = sqlite3.connect(ARTIFACTS / "docs.sqlite")
    try:
        marks = ",".join("?" * len(doc_ids))
        rows = db.execute(
            f"SELECT id, category, snippet FROM docs WHERE id IN ({marks})", doc_ids
        )
        return {doc_id: (category, snippet) for doc_id, category, snippet in rows}
    finally:
        db.close()


def search(query: str, top_k: int = TOP_K) -> dict:
    """Top documents for `query` by cosine similarity in the 100-dim LSA space.

    Returns {"results": [...], "matched_terms": [...], "n_documents": int}.
    matched_terms — the query tokens that exist in the vocabulary — lets the
    demo show what the search actually saw (and that stopwords vanish).
    """
    state = _load()
    counts: dict[int, int] = {}
    matched: list[str] = []
    for token in _TOKEN.findall(query.lower()):
        index = state["vocab"].get(token)
        if index is not None:
            counts[index] = counts.get(index, 0) + 1
            if token not in matched:
                matched.append(token)

    if not counts:
        return {"results": [], "matched_terms": [], "n_documents": len(state["doc_vectors"])}

    indices = np.fromiter(counts.keys(), dtype=np.int64)
    tfidf = np.fromiter(counts.values(), dtype=np.float32) * state["idf"][indices]
    tfidf /= np.linalg.norm(tfidf)
    # project the sparse query: sum of its terms' component columns, weighted
    query_vector = state["components"][:, indices] @ tfidf
    norm = float(np.linalg.norm(query_vector))
    if norm < 1e-12:
        return {"results": [], "matched_terms": matched, "n_documents": len(state["doc_vectors"])}
    similarities = state["doc_vectors"] @ (query_vector / norm)

    top = np.argsort(similarities)[::-1][:top_k]
    snippets = _snippets([int(i) for i in top])
    results = []
    for rank, i in enumerate(top, start=1):
        category, snippet = snippets[int(i)]
        results.append(
            {
                "rank": rank,
                "doc_id": int(i),
                "score": float(similarities[i]),
                "category": state["categories"][category],
                "snippet": snippet,
            }
        )
    return {"results": results, "matched_terms": matched, "n_documents": len(state["doc_vectors"])}
