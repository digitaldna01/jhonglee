"""KMeans clustering API — /api/kmeans/*."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from . import service as kmeans_ml
from .schemas import DatasetKind, DatasetResponse, RunRequest, RunResponse

router = APIRouter(prefix="/kmeans", tags=["kmeans"])


@router.get("/dataset", response_model=DatasetResponse)
def dataset(
    n: int = Query(300, ge=1, le=2000),
    seed: int | None = None,
    kind: DatasetKind = "blobs",
):
    """A fresh dataset of the requested shape. The frontend keeps it stable across
    init-method switches and only calls this again on a new dataset / shape."""
    return {"points": kmeans_ml.generate_dataset(n, seed, kind).tolist()}


@router.post("/run", response_model=RunResponse)
def run(req: RunRequest):
    """Run the full Lloyd's algorithm and return every step."""
    if req.k > len(req.points):
        raise HTTPException(400, "k cannot exceed the number of points")
    if req.init == "manual" and (
        not req.manual_centroids or len(req.manual_centroids) != req.k
    ):
        raise HTTPException(400, "manual init requires exactly k centroids")
    try:
        return kmeans_ml.run(
            req.points, req.k, req.init, req.manual_centroids, req.seed
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
