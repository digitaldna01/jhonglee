"""Pure-numpy KMeans (Lloyd's algorithm), framework-agnostic.

Ported from the original jhonglee-assignment-2 implementation, with all
matplotlib / disk / global-state rendering removed. A run returns the full
sequence of steps as plain Python data so the API can serialize it to JSON and
the frontend can animate it. This also makes it stateless and concurrency-safe
(the original used module globals + per-step PNG files on disk).
"""
from __future__ import annotations

import numpy as np

RANGE = 10.0  # data points live in [0, RANGE] x [0, RANGE]


def generate_dataset(num_points: int, seed: int | None = None) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.random((num_points, 2)) * RANGE


def _assign(data: np.ndarray, centers: np.ndarray) -> np.ndarray:
    """Index of the nearest center for every point (vectorized)."""
    dists = np.linalg.norm(data[:, None, :] - centers[None, :, :], axis=2)  # (n, k)
    return np.argmin(dists, axis=1)


def _recompute(
    data: np.ndarray, assignments: np.ndarray, k: int, centers: np.ndarray
) -> np.ndarray:
    """Mean of each cluster; keep the old center for an empty cluster."""
    new = centers.copy()
    for j in range(k):
        members = data[assignments == j]
        if len(members):
            new[j] = members.mean(axis=0)
    return new


def init_centers(
    data: np.ndarray, k: int, method: str, rng: np.random.Generator
) -> np.ndarray:
    n = len(data)
    if method == "random":
        return data[rng.choice(n, size=k, replace=False)].astype(float)

    if method == "farthest_first":
        centers = [data[rng.integers(0, n)]]
        while len(centers) < k:
            d = np.min([np.linalg.norm(data - c, axis=1) for c in centers], axis=0)
            centers.append(data[int(np.argmax(d))])
        return np.array(centers, dtype=float)

    if method in ("kmeans++", "kmean_plus"):
        centers = [data[rng.integers(0, n)]]
        for _ in range(1, k):
            d2 = np.min([np.linalg.norm(data - c, axis=1) ** 2 for c in centers], axis=0)
            total = d2.sum()
            probs = d2 / total if total > 0 else np.full(n, 1.0 / n)
            centers.append(data[rng.choice(n, p=probs)])
        return np.array(centers, dtype=float)

    raise ValueError(f"unknown init method: {method!r}")


def run(
    points,
    k: int,
    init: str = "random",
    manual_centroids=None,
    seed: int | None = None,
    max_iter: int = 100,
) -> dict:
    """Run Lloyd's algorithm and return every snapshot.

    Returns {"steps": [{"centroids": [[x,y]...], "assignments": [int...]}, ...],
             "converged": bool, "iterations": int}.
    """
    data = np.asarray(points, dtype=float)
    rng = np.random.default_rng(seed)

    if init == "manual":
        if manual_centroids is None or len(manual_centroids) != k:
            raise ValueError("manual init requires exactly k centroids")
        centers = np.asarray(manual_centroids, dtype=float)
    else:
        centers = init_centers(data, k, init, rng)

    assignments = _assign(data, centers)
    steps = [{"centroids": centers.tolist(), "assignments": assignments.tolist()}]

    converged = False
    for _ in range(max_iter):
        new_centers = _recompute(data, assignments, k, centers)
        converged = bool(np.allclose(new_centers, centers))
        centers = new_centers
        assignments = _assign(data, centers)
        steps.append(
            {"centroids": centers.tolist(), "assignments": assignments.tolist()}
        )
        if converged:
            break

    return {"steps": steps, "converged": converged, "iterations": len(steps) - 1}
