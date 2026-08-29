"""Retrieval golden-set evaluation — compare embedding models / chunking offline.

    cd be_src && PYTHONPATH=. .venv/bin/python scripts/eval_retrieval.py [MODEL ...]

No database needed: builds the same passages ingest would (ingest.plan),
embeds them in memory, and scores each golden question by the best chunk
per document — exactly the ranking retrieval.py performs. Reports
recall@1 / recall@4 per language, timing, and peak RSS of a fresh process
that loads the model (the number that matters on the 2 GB Pi).

Default models: the configured EMBED_MODEL and the previous bge-small.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

from app.chat import embedding, ingest  # noqa: E402
from app.core.config import get_settings  # noqa: E402

HERE = Path(__file__).parent
DOCS = json.load(open(HERE.parent / "app/content/corpus.json"))["docs"]
GOLDEN = json.load(open(HERE / "golden_set.json"))
K = 4


def evaluate(name: str) -> dict:
    model = embedding.load(name)
    rows = ingest.plan(name, DOCS)
    t0 = time.perf_counter()
    P = embedding.embed_passages(model, [r.passage for r in rows])
    t_embed = time.perf_counter() - t0
    doc_ids = [r.doc_id for r in rows]

    out: dict = {"embed_s": t_embed}
    n_q = 0
    t0 = time.perf_counter()
    for lang in ("en", "ko"):
        cases = GOLDEN[lang]
        r1 = rk = 0
        misses = []
        for case in cases:
            q = embedding.embed_query(model, case["q"])
            n_q += 1
            best: dict[str, float] = {}
            for d, s in zip(doc_ids, P @ q):
                best[d] = max(best.get(d, -1.0), float(s))
            rank = sorted(best, key=best.get, reverse=True)
            expect = set(case["expect"])
            r1 += rank[0] in expect
            hit = bool(set(rank[:K]) & expect)
            rk += hit
            if not hit:
                misses.append(f"{case['q']} → {rank[:K]}")
        out[lang] = {"r1": r1, "rk": rk, "n": len(cases), "misses": misses}
    out["query_ms"] = (time.perf_counter() - t0) / n_q * 1000
    return out


def peak_rss_mb(name: str) -> int:
    code = (
        "import resource, warnings; warnings.filterwarnings('ignore')\n"
        "from app.chat import embedding\n"
        f"m = embedding.load({name!r}); embedding.embed_query(m, 'warm up')\n"
        "print(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)"
    )
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=HERE.parent)
    raw = int(r.stdout.strip().splitlines()[-1])
    return raw // 2**20 if sys.platform == "darwin" else raw // 1024  # bytes on macOS, KB on Linux


def main(models: list[str]) -> None:
    for name in models:
        res = evaluate(name)
        print(f"\n===== {name} =====")
        for lang in ("en", "ko"):
            r = res[lang]
            print(f"  {lang.upper()}: recall@1 {r['r1']}/{r['n']} ({r['r1']/r['n']:.0%})   "
                  f"recall@{K} {r['rk']}/{r['n']} ({r['rk']/r['n']:.0%})")
            for m in r["misses"]:
                print("      · miss:", m)
        print(f"  embed {len(DOCS)} docs: {res['embed_s']:.2f}s   per query: {res['query_ms']:.0f} ms")
        print(f"  peak RSS (fresh process, load+embed): {peak_rss_mb(name)} MB")


if __name__ == "__main__":
    main(sys.argv[1:] or [get_settings().embed_model, "BAAI/bge-small-en-v1.5"])
