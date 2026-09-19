"""Build the LSA demo artifacts — the offline half of app/demos/lsa.

The demo (a latent-semantic-analysis search over 20 Newsgroups, the successor
to the original course assignment) never fits anything at runtime: this script
does the expensive part once — TF-IDF over ~19k posts, truncated SVD down to
100 dimensions — and saves only what serving needs:

  app/demos/lsa/artifacts/
    lsa.npz      vocab (unicode array), idf, svd components (float32,
                 100 x vocab), doc vectors (float32, n_docs x 100,
                 L2-normalized), category names
    docs.sqlite  one row per document: category id + a display snippet

Resident cost on the Pi: ~16 MB of float32 arrays; snippets stay on disk and
only the top hits are read per query. Serving needs numpy alone — replicating
sklearn's TF-IDF transform for a query is a vocabulary lookup plus idf weights
(tokens outside the vocabulary, stopwords included, simply drop out).

Run from be_src (needs scikit-learn, which is NOT in requirements.txt — it is
a build-time dependency only):

    python scripts/build_lsa_demo.py

Deterministic (seeded SVD), so CI can rebuild it and get the same demo.
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import numpy as np

ARTIFACTS = Path(__file__).resolve().parent.parent / "app" / "demos" / "lsa" / "artifacts"
VOCAB_SIZE = 20_000
DIMENSIONS = 100
SNIPPET_CHARS = 700
SEED = 0


def main() -> None:
    from sklearn.datasets import fetch_20newsgroups
    from sklearn.decomposition import TruncatedSVD
    from sklearn.feature_extraction.text import TfidfVectorizer

    print("fetching 20 Newsgroups…", flush=True)
    # headers/footers/quotes stripped: they are reply chrome, not content, and
    # they leak names/emails into snippets the demo would then display
    news = fetch_20newsgroups(subset="all", remove=("headers", "footers", "quotes"))
    documents: list[str] = news.data
    print(f"  {len(documents)} documents, {len(news.target_names)} categories")

    print("TF-IDF…", flush=True)
    vectorizer = TfidfVectorizer(stop_words="english", max_features=VOCAB_SIZE)
    td_matrix = vectorizer.fit_transform(documents)

    print(f"SVD to {DIMENSIONS} dimensions…", flush=True)
    svd = TruncatedSVD(n_components=DIMENSIONS, random_state=SEED)
    doc_vectors = svd.fit_transform(td_matrix).astype(np.float32)
    norms = np.linalg.norm(doc_vectors, axis=1, keepdims=True)
    doc_vectors /= np.maximum(norms, 1e-12)  # cosine becomes a dot product
    print(f"  explained variance: {svd.explained_variance_ratio_.sum():.3f}")

    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    # dtype=str forces a unicode array — object arrays would need pickle to load
    vocab = np.array(vectorizer.get_feature_names_out(), dtype=str)
    np.savez_compressed(
        ARTIFACTS / "lsa.npz",
        vocab=vocab,
        idf=vectorizer.idf_.astype(np.float32),
        components=svd.components_.astype(np.float32),
        doc_vectors=doc_vectors,
        categories=np.array(news.target_names, dtype=str),
    )

    db_path = ARTIFACTS / "docs.sqlite"
    db_path.unlink(missing_ok=True)
    db = sqlite3.connect(db_path)
    db.execute("CREATE TABLE docs (id INTEGER PRIMARY KEY, category INTEGER, snippet TEXT)")
    rows = (
        (i, int(news.target[i]), " ".join(doc.split())[:SNIPPET_CHARS])
        for i, doc in enumerate(documents)
    )
    db.executemany("INSERT INTO docs VALUES (?, ?, ?)", rows)
    db.commit()
    db.close()

    size_mb = sum(f.stat().st_size for f in ARTIFACTS.iterdir()) / 1e6
    print(f"wrote {ARTIFACTS} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    sys.exit(main())
