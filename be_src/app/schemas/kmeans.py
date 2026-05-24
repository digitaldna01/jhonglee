"""Request/response models for the KMeans feature."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

InitMethod = Literal["random", "farthest_first", "kmeans++", "manual"]


class RunRequest(BaseModel):
    points: list[list[float]] = Field(..., description="2D data points [[x, y], ...]")
    k: int = Field(..., ge=1, le=12)
    init: InitMethod = "random"
    manual_centroids: Optional[list[list[float]]] = None
    seed: Optional[int] = None


class Step(BaseModel):
    centroids: list[list[float]]
    assignments: list[int]


class RunResponse(BaseModel):
    steps: list[Step]
    converged: bool
    iterations: int


class DatasetResponse(BaseModel):
    points: list[list[float]]
