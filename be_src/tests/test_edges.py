"""retrieval.edges — mutual-kNN ∩ z-score edges (floating nodes allowed)."""
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


def _pairs(edges):
    return {(e["a"], e["b"]) for e in edges}


def test_edges_link_mutual_neighbours_above_the_bar_and_let_loners_float():
    vecs = _vecs()
    edges = build_edges(_nodes(vecs), vecs)
    pairs = _pairs(edges)
    assert ("a1", "a2") in pairs and ("b1", "b2") in pairs
    assert not any("lone" in p for p in pairs)  # floats: no pair above the bar
    assert all(0.15 <= e["w"] <= 0.85 for e in edges)
    # stricter bar → fewer edges; looser → more (monotone in z)
    assert len(build_edges(_nodes(vecs), vecs, z=2.0)) <= len(edges) <= len(build_edges(_nodes(vecs), vecs, z=0.0))


def test_reciprocity_is_required_and_caps_degree_at_k():
    # a hub everyone is close to, plus a ring of satellites that are each
    # other's nearest: the hub is in every satellite's top-2 but only two
    # satellites can be in the hub's, so the hub gets ≤ 2 links
    base = np.array([1.0, 1.0, 1.0, 1.0, 1.0])
    vecs = {"hub": base.copy()}
    for i in range(4):
        v = base.copy()
        v[i] += 0.5
        vecs[f"s{i}"] = v
    edges = build_edges(_nodes(vecs), vecs, z=-5.0)  # bar off: reciprocity alone decides
    degree = {}
    for e in edges:
        for x in (e["a"], e["b"]):
            degree[x] = degree.get(x, 0) + 1
    assert max(degree.values()) <= 2
    # without the rule (k=0) the same bar links every pair → complete graph
    assert len(build_edges(_nodes(vecs), vecs, z=-5.0, k=0)) == 5 * 4 // 2


def test_edges_need_statistics_and_are_stable_in_corpus_order():
    vecs = _vecs()
    assert build_edges(_nodes(["a1", "a2"]), vecs) == []  # too few nodes for a mean/σ
    assert build_edges(_nodes(vecs), {}) == []
    ids = list(vecs)
    assert build_edges(_nodes(ids), vecs) == build_edges(_nodes(ids), vecs)
