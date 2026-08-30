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


DATASET_KINDS = ("uniform", "blobs", "moons", "uneven")


def generate_dataset(
    num_points: int, seed: int | None = None, kind: str = "blobs"
) -> np.ndarray:
    """Synthetic 2D data in [0, RANGE]^2.

    kind:
      blobs   — a few well-separated, similarly sized gaussian blobs (KMeans shines)
      uneven  — one large spread-out blob beside small tight ones (size disparity)
      moons   — two interleaving half-moons (non-globular; KMeans struggles)
      uniform — uniform noise, no real clusters
    """
    rng = np.random.default_rng(seed)

    if kind == "uniform":
        pts = rng.random((num_points, 2)) * RANGE

    elif kind == "blobs":
        centers = rng.uniform(0.18, 0.82, size=(4, 2)) * RANGE
        labels = rng.integers(0, len(centers), size=num_points)
        pts = centers[labels] + rng.normal(0, 0.55, size=(num_points, 2))

    elif kind == "uneven":
        centers = np.array([[0.32, 0.5], [0.78, 0.76], [0.78, 0.26]]) * RANGE
        stds = np.array([1.7, 0.45, 0.45])
        counts = (np.array([0.7, 0.15, 0.15]) * num_points).astype(int)
        counts[0] += num_points - counts.sum()
        pts = np.vstack(
            [c + rng.normal(0, s, (n, 2)) for c, s, n in zip(centers, stds, counts)]
        )

    elif kind == "moons":
        n_a = num_points // 2
        t_a = np.linspace(0, np.pi, n_a)
        t_b = np.linspace(0, np.pi, num_points - n_a)
        moon_a = np.c_[np.cos(t_a), np.sin(t_a)]
        moon_b = np.c_[1 - np.cos(t_b), 0.5 - np.sin(t_b)]
        pts = np.vstack([moon_a, moon_b]) + rng.normal(0, 0.05, (num_points, 2))
        lo, hi = pts.min(0), pts.max(0)  # normalize into a centered box
        pts = (pts - lo) / (hi - lo) * (RANGE * 0.9) + RANGE * 0.05

    else:
        raise ValueError(f"unknown dataset kind: {kind!r}")

    return np.clip(pts, 0.0, RANGE)


def _inertia(data: np.ndarray, centers: np.ndarray, assignments: np.ndarray) -> float:
    """Within-cluster sum of squares — the cost KMeans minimizes."""
    diff = data - centers[assignments]
    return float(np.einsum("ij,ij->", diff, diff))


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

    Returns {"steps": [{"centroids": [[x,y]...], "assignments": [int...],
             "inertia": float}, ...], "converged": bool, "iterations": int}.
    """
    data = np.asarray(points, dtype=float)
    rng = np.random.default_rng(seed)

    if init == "manual":
        if manual_centroids is None or len(manual_centroids) != k:
            raise ValueError("manual init requires exactly k centroids")
        centers = np.asarray(manual_centroids, dtype=float)
    else:
        centers = init_centers(data, k, init, rng)

    def snapshot(centers, assignments):
        return {
            "centroids": centers.tolist(),
            "assignments": assignments.tolist(),
            "inertia": _inertia(data, centers, assignments),
        }

    assignments = _assign(data, centers)
    steps = [snapshot(centers, assignments)]

    converged = False
    for _ in range(max_iter):
        new_centers = _recompute(data, assignments, k, centers)
        converged = bool(np.allclose(new_centers, centers))
        centers = new_centers
        assignments = _assign(data, centers)
        steps.append(snapshot(centers, assignments))
        if converged:
            break

    return {"steps": steps, "converged": converged, "iterations": len(steps) - 1}
