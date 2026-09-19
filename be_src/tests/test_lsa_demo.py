"""LSA demo serving math on a tiny handmade space (no sklearn, no real artifacts).

The vocabulary is three terms and the "SVD" is chosen so each term maps to an
axis-aligned concept vector — making the expected ranking computable by hand.
"""
import sqlite3

import numpy as np
import pytest

from app.demos.lsa import service


@pytest.fixture()
def tiny_artifacts(tmp_path, monkeypatch):
    """vocab {apple, banana, car}; two docs: fruit-ish and car-ish."""
    np.savez(
        tmp_path / "lsa.npz",
        vocab=np.array(["apple", "banana", "car"], dtype=str),
        idf=np.ones(3, dtype=np.float32),
        # concept 0 = fruit (apple+banana), concept 1 = vehicles (car)
        components=np.array([[1.0, 1.0, 0.0], [0.0, 0.0, 1.0]], dtype=np.float32),
        doc_vectors=np.array([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32),
        categories=np.array(["fruit", "vehicles"], dtype=str),
    )
    db = sqlite3.connect(tmp_path / "docs.sqlite")
    db.execute("CREATE TABLE docs (id INTEGER PRIMARY KEY, category INTEGER, snippet TEXT)")
    db.executemany(
        "INSERT INTO docs VALUES (?, ?, ?)",
        [(0, 0, "apples and bananas"), (1, 1, "my car broke down")],
    )
    db.commit()
    db.close()
    monkeypatch.setattr(service, "ARTIFACTS", tmp_path)
    monkeypatch.setattr(service, "_state", None)
    return tmp_path


def test_ranks_by_concept(tiny_artifacts):
    out = service.search("apple banana pie")
    assert out["matched_terms"] == ["apple", "banana"]  # "pie" is out of vocabulary
    assert [r["doc_id"] for r in out["results"]] == [0, 1]
    top = out["results"][0]
    assert top["category"] == "fruit"
    assert top["snippet"] == "apples and bananas"
    assert top["score"] == pytest.approx(1.0)


def test_other_concept_wins_for_car(tiny_artifacts):
    out = service.search("car")
    assert out["results"][0]["doc_id"] == 1
    assert out["results"][0]["category"] == "vehicles"


def test_out_of_vocabulary_query_returns_nothing(tiny_artifacts):
    out = service.search("zeppelin xylophone")
    assert out["results"] == []
    assert out["matched_terms"] == []
    assert out["n_documents"] == 2


def test_available_reflects_artifacts(tiny_artifacts, tmp_path, monkeypatch):
    assert service.available()
    monkeypatch.setattr(service, "ARTIFACTS", tmp_path / "nowhere")
    assert not service.available()


def test_repeated_terms_shift_weight(tiny_artifacts):
    # "car car apple": tf puts more weight on car → vehicles doc should win
    out = service.search("car car apple")
    assert out["results"][0]["doc_id"] == 1
