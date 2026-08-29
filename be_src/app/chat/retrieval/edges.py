"""Graph edges for the landing map, derived from the summary vectors.

Each node links to its top-MAX most similar peers. Real-embedding cosines
cluster high, so raw scores are rescaled into the weight band the force
layout was tuned for.
"""
from __future__ import annotations

import numpy as np

_EDGE_MAX_PER_NODE = 2


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b)) or 1.0
    return float(np.dot(a, b)) / denom


def build_edges(nodes: list[dict], doc_vecs: dict[str, np.ndarray]) -> list[dict]:
    """[{a, b, w}] for `nodes` (corpus order → stable output) that have a vector."""
    nodes = [d for d in nodes if d["id"] in doc_vecs]
    raw: dict[tuple[int, int], float] = {}
    for ai, a in enumerate(nodes):
        sims = sorted(
            (
                (bi, _cosine(doc_vecs[a["id"]], doc_vecs[b["id"]]))
                for bi, b in enumerate(nodes)
                if bi != ai
            ),
            key=lambda x: x[1],
            reverse=True,
        )[:_EDGE_MAX_PER_NODE]
        for bi, s in sims:
            key = (ai, bi) if ai < bi else (bi, ai)
            raw[key] = max(raw.get(key, 0.0), s)

    if not raw:
        return []
    lo, hi = min(raw.values()), max(raw.values())
    span = (hi - lo) or 1.0
    return [
        {
            "a": nodes[ai]["id"],
            "b": nodes[bi]["id"],
            "w": round(0.15 + 0.7 * ((s - lo) / span), 3),
        }
        for (ai, bi), s in sorted(raw.items())
    ]
