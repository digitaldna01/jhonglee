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
from app.chat.retrieval import CONTEXT_WEIGHT, contextual_query, rrf  # noqa: E402
from app.content.repository import by_id  # noqa: E402
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

    def rank_docs(text: str) -> list[str]:
        """Docs by their best chunk's cosine — what store.search does."""
        q = embedding.embed_query(model, text)
        best: dict[str, float] = {}
        for d, s in zip(doc_ids, P @ q):
            best[d] = max(best.get(d, -1.0), float(s))
        return sorted(best, key=best.get, reverse=True)

    out: dict = {"embed_s": t_embed}
    n_q = 0
    t0 = time.perf_counter()
    for lang in ("en", "ko"):
        cases = GOLDEN[lang]
        r1 = rk = 0
        misses = []
        for case in cases:
            rank = rank_docs(case["q"])
            n_q += 1
            expect = set(case["expect"])
            top1 = rank[0] in expect
            hit = bool(set(rank[:K]) & expect)
            r1 += top1
            rk += hit
            if not hit:
                misses.append(f"MISS@{K}  {case['q']} → {rank[:K]}")
            elif not top1:
                misses.append(f"miss@1   {case['q']} → top1={rank[0]} (expected in top{K} ✓)")
        out[lang] = {"r1": r1, "rk": rk, "n": len(cases), "misses": misses}
    out["query_ms"] = (time.perf_counter() - t0) / n_q * 1000

    # two-turn cases: question-only vs weighted RRF(question, question + previous
    # turn's top-source title) — the previous turn's top source is what the
    # server stores as the session's last_sources[0]
    fu: dict = {}
    for case in GOLDEN.get("followup", []):
        single = rank_docs(case["q"])
        prev_title = by_id(rank_docs(case["prev"])[0])["title"]
        fused = rrf(
            [single, rank_docs(contextual_query(case["q"], prev_title))], [1.0, CONTEXT_WEIGHT]
        )
        expect = set(case["expect"])
        t = fu.setdefault(case["type"], {"n": 0, "single1": 0, "singlek": 0, "fused1": 0, "fusedk": 0, "misses": []})
        t["n"] += 1
        t["single1"] += single[0] in expect
        t["singlek"] += bool(set(single[:K]) & expect)
        t["fused1"] += fused[0] in expect
        t["fusedk"] += bool(set(fused[:K]) & expect)
        if fused[0] not in expect:
            t["misses"].append(f"[{case['type']}] {case['prev']} → {case['q']} :: fused top1={fused[0]} single top1={single[0]}")
    out["followup"] = fu
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
                print("      ·", m)
        print(f"  embed {len(DOCS)} docs: {res['embed_s']:.2f}s   per query: {res['query_ms']:.0f} ms")
        if res["followup"]:
            print("  follow-up (two-turn)            question-only        wRRF(question, question+prev-title)")
            for t, r in sorted(res["followup"].items()):
                print(f"    type {t} (n={r['n']}):  r@1 {r['single1']}/{r['n']}  r@{K} {r['singlek']}/{r['n']}"
                      f"      r@1 {r['fused1']}/{r['n']}  r@{K} {r['fusedk']}/{r['n']}")
                for m in r["misses"]:
                    print("      ·", m)
        print(f"  peak RSS (fresh process, load+embed): {peak_rss_mb(name)} MB")


if __name__ == "__main__":
    main(sys.argv[1:] or [get_settings().embed_model, "BAAI/bge-small-en-v1.5"])
