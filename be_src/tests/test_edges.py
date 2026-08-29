"""retrieval.edges — z-score similarity edges (floating nodes allowed)."""
from __future__ import annotations

import numpy as np

from app.chat.retrieval.edges import build_edges


def _vecs():
    # two tight clusters, one loner, in a space where everything shares a
    # background direction (the anisotropy real embeddings have)
    base = np.array([1.0, 1.0, 1.0, 1.0])
    return {
        "a1": base + np.array([1.0, 0, 0, 0]),
        "a2": base + np.array([0.9, 0.1, 0, 0]),
        "b1": base + np.array([0, 0, 1.0, 0]),
        "b2": base + np.array([0, 0, 0.9, 0.1]),
        "lone": base + np.array([-0.5, 0.6, -0.5, 0.7]),
    }


def _nodes(ids):
    return [{"id": i} for i in ids]


def test_edges_link_only_unusually_similar_pairs_and_let_loners_float():
    vecs = _vecs()
    edges = build_edges(_nodes(vecs), vecs)
    pairs = {(e["a"], e["b"]) for e in edges}
    assert ("a1", "a2") in pairs and ("b1", "b2") in pairs
    assert not any("lone" in p for p in pairs)  # floats: no pair above the bar
    assert all(0.15 <= e["w"] <= 0.85 for e in edges)
    # stricter bar → fewer edges; looser → more (monotone in z)
    assert len(build_edges(_nodes(vecs), vecs, z=2.0)) <= len(edges) <= len(build_edges(_nodes(vecs), vecs, z=0.0))


def test_edges_have_no_per_node_cap_and_need_statistics():
    vecs = _vecs()
    every = build_edges(_nodes(vecs), vecs, z=-5.0)  # every pair qualifies → complete graph
    assert len(every) == 5 * 4 // 2
    assert build_edges(_nodes(["a1", "a2"]), vecs) == []  # too few nodes for a mean/σ
    assert build_edges(_nodes(vecs), {}) == []


def test_edges_are_stable_in_corpus_order():
    vecs = _vecs()
    ids = list(vecs)
    assert build_edges(_nodes(ids), vecs) == build_edges(_nodes(ids), vecs)
