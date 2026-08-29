"""Graph edges for the landing map, derived from the summary vectors.

A pair of documents is linked when the two are each other's nearest
neighbours — each is among the other's EDGE_K most similar documents
(a *mutual* kNN graph, the sparse variant von Luxburg's spectral-clustering
tutorial recommends for separating clusters of unequal density) — AND the
pair's cosine is at least EDGE_Z standard deviations above the corpus mean
(an ε-graph floor, so two mutually-nearest but plainly unrelated documents
stay apart once the corpus is big enough for that to happen).

Why both. A z-score alone means "more similar than this corpus's average
pair", which links ~30 % of all pairs whatever the corpus is made of and
grows as n² — a web, not a map. A raw cosine threshold doesn't transfer
between embedding models (anisotropy puts unrelated pairs at ~0.25) and
under-links the parts of the corpus the model embeds "loosely" (here the
ML posts sit at 0.32 to each other while design posts sit at 0.4–0.55).
Rank-based reciprocity is model-agnostic and gives every region of the
corpus its closest kin; the floor keeps rank from inventing relations.

Consequences: at most EDGE_K links per node, edges grow ~linearly with n,
clusters (art vs code) emerge on their own, and nodes with no reciprocal
partner float — a lone project is an honest picture.

Edge weight is a fixed function of the z-score (z = EDGE_Z → 0.15,
z = 3 → 0.85), so the layout's spring lengths and line widths keep their
feel across models instead of being rescaled to whatever the min/max is.
"""
from __future__ import annotations

import numpy as np

EDGE_K = 2  # link a pair only if each is among the other's K nearest
EDGE_Z = 0.5  # …and the pair is at least this many σ above the corpus mean cosine
_W_MIN, _W_MAX, _Z_MAX = 0.15, 0.85, 3.0


def _weight(z: float, z_min: float) -> float:
    span = max(_Z_MAX - z_min, 1e-6)
    return round(_W_MIN + (_W_MAX - _W_MIN) * min(max((z - z_min) / span, 0.0), 1.0), 3)


def build_edges(
    nodes: list[dict],
    doc_vecs: dict[str, np.ndarray],
    *,
    z: float = EDGE_Z,
    k: int | None = EDGE_K,
) -> list[dict]:
    """[{a, b, w}] for `nodes` (corpus order → stable output) that have a vector.
    `k=None` (or 0) drops the reciprocity rule and links every pair above the σ bar."""
    nodes = [d for d in nodes if d["id"] in doc_vecs]
    n = len(nodes)
    if n < 3:  # no meaningful statistics
        return []
    mat = np.stack([doc_vecs[d["id"]] for d in nodes]).astype(np.float64)
    mat /= np.maximum(np.linalg.norm(mat, axis=1, keepdims=True), 1e-12)
    sims = mat @ mat.T
    iu = np.triu_indices(n, 1)
    vals = sims[iu]
    mean, sd = float(vals.mean()), float(vals.std())
    if sd < 1e-9:
        return []
    zs = (sims - mean) / sd

    if k:
        ranked = np.argsort(-sims, axis=1)[:, 1 : k + 1]  # each row's K nearest, self excluded
        near = np.zeros((n, n), dtype=bool)
        np.put_along_axis(near, ranked, True, axis=1)
        mutual = near & near.T
    else:
        mutual = np.ones((n, n), dtype=bool)

    return [
        {"a": nodes[i]["id"], "b": nodes[j]["id"], "w": _weight(float(zs[i, j]), z)}
        for i, j in zip(*iu)
        if mutual[i, j] and zs[i, j] >= z
    ]
