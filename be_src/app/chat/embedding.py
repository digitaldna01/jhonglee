"""Embedding model loading — fastembed, plus models outside its catalog.

Deliberately free of app imports so the Dockerfile can pre-download the
model by running this file directly:

    python app/chat/embedding.py <model-name>

CUSTOM lists models registered with fastembed's add_custom_model before
loading: ONNX files on Hugging Face that fastembed does not ship in its
catalog (here the int8 build of a multilingual sentence-transformer —
same 384-d space as the full model, ~60% of the RAM; measured on the
2 GB Pi budget in docs/rag-design-notes.md).
"""
from __future__ import annotations

import sys

import numpy as np

# name → add_custom_model kwargs (pooling/normalization/sources added at registration)
CUSTOM: dict[str, dict] = {
    "Xenova/paraphrase-multilingual-MiniLM-L12-v2-q8": {
        "hf": "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
        "model_file": "onnx/model_quantized.onnx",  # int8
        "dim": 384,
        "pooling": "MEAN",
        "size_in_gb": 0.12,
        "description": "multilingual (incl. Korean) MiniLM-L12, int8 ONNX; 384-d, mean pooling",
    },
}

_registered: set[str] = set()


def _register(name: str) -> None:
    if name in _registered:
        return
    from fastembed import TextEmbedding
    from fastembed.common.model_description import ModelSource, PoolingType

    spec = CUSTOM[name]
    TextEmbedding.add_custom_model(
        model=name,
        pooling=PoolingType[spec["pooling"]],
        normalization=True,
        sources=ModelSource(hf=spec["hf"]),
        dim=spec["dim"],
        model_file=spec["model_file"],
        description=spec.get("description", ""),
        size_in_gb=spec.get("size_in_gb", 0.0),
    )
    _registered.add(name)


def load(name: str):
    """A fastembed TextEmbedding for `name` (downloads on first use)."""
    from fastembed import TextEmbedding

    if name in CUSTOM:
        _register(name)
    return TextEmbedding(name)


def _unit(v) -> np.ndarray:
    a = np.asarray(v, dtype=np.float32)
    return a / (np.linalg.norm(a) or 1.0)


# fastembed's default batch is 256, i.e. the whole corpus in one onnxruntime run —
# and ORT's arena grows to that peak and never gives it back. Measured in the
# arm64 image (MiniLM int8, 51 passages): one batch 1.7 GB RSS, batch 8 822 MB,
# 4 665 MB, 2 584 MB, 1 541 MB — and one-at-a-time was also the fastest (1.3 s
# vs 1.7 s; CPU inference gains nothing from batching). On a 2 GB Pi that is
# the difference between fitting and swapping, so: one passage per run.
EMBED_BATCH = 1


def embed_passages(model, texts: list[str]) -> np.ndarray:
    """(n, dim) L2-normalised passage vectors — cosine == dot product downstream."""
    return np.stack([_unit(v) for v in model.passage_embed(texts, batch_size=EMBED_BATCH)])


def embed_query(model, text: str) -> np.ndarray:
    """One L2-normalised query vector (query prefix handled by fastembed where the model wants it)."""
    return _unit(next(iter(model.query_embed(text))))


if __name__ == "__main__":  # Dockerfile: pre-download the model into the image
    name = sys.argv[1]
    m = load(name)
    vec = embed_query(m, "warm up")
    print(f"{name}: ready, dim={vec.shape[0]}")
