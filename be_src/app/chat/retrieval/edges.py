"""Graph edges for the landing map, derived from the summary vectors.

A pair of documents is linked when its cosine is unusually high *for this
corpus*: at least EDGE_Z standard deviations above the mean of all pairs.
Raw cosine thresholds don't transfer between embedding models (anisotropy
puts unrelated pairs at ~0.25 already), but "clearly more similar than the
average pair" does, and the statistics are recomputed after every index
sync, so a new post recalibrates the map. Nodes with no such pair simply
float — a lone project is an honest picture; a hub is one too (the map
sizes dots by degree), so there is deliberately no per-node cap: if the
map ever gets busy, raise EDGE_Z, which treats every node alike.

Edge weight is a fixed function of the z-score (z = EDGE_Z → 0.15,
z = 3 → 0.85), so the layout's spring lengths and line widths keep their
feel across models instead of being rescaled to whatever the min/max is.
"""
from __future__ import annotations

import numpy as np

EDGE_Z = 0.5  # link pairs at least this many σ above the corpus mean cosine
_W_MIN, _W_MAX, _Z_MAX = 0.15, 0.85, 3.0


def _weight(z: float, z_min: float) -> float:
    span = max(_Z_MAX - z_min, 1e-6)
    return round(_W_MIN + (_W_MAX - _W_MIN) * min(max((z - z_min) / span, 0.0), 1.0), 3)


def build_edges(
    nodes: list[dict],
    doc_vecs: dict[str, np.ndarray],
    *,
    z: float = EDGE_Z,
) -> list[dict]:
    """[{a, b, w}] for `nodes` (corpus order → stable output) that have a vector."""
    nodes = [d for d in nodes if d["id"] in doc_vecs]
    if len(nodes) < 3:  # no meaningful statistics
        return []
    mat = np.stack([doc_vecs[d["id"]] for d in nodes]).astype(np.float64)
    mat /= np.maximum(np.linalg.norm(mat, axis=1, keepdims=True), 1e-12)
    sims = mat @ mat.T
    iu = np.triu_indices(len(nodes), 1)
    vals = sims[iu]
    mean, sd = float(vals.mean()), float(vals.std())
    if sd < 1e-9:
        return []
    zs = (sims - mean) / sd

    return [
        {"a": nodes[i]["id"], "b": nodes[j]["id"], "w": _weight(float(zs[i, j]), z)}
        for i, j in zip(*iu)
        if zs[i, j] >= z
    ]
