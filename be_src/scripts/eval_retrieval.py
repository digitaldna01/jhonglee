"""Retrieval golden-set evaluation — compare models / ranking settings offline.

    cd be_src && PYTHONPATH=. .venv/bin/python scripts/eval_retrieval.py [MODEL ...]
        --sweep   also try a range of keyword weights (and the context-keyword knob)
        --pg      rank against the Postgres store at DATABASE_URL (tsvector path)
                  instead of the in-memory one; configured model only

Builds the same index ingest would (MemoryStore: numpy + BM25) and ranks
with retrieval.hybrid.rank — exactly production's ranking — for each
setting: dense only vs hybrid. Reports recall@1 / recall@4 per language,
the two-turn follow-up cases per type, timing, and peak RSS of a fresh
process that loads the model (the number that matters on the 2 GB Pi).

Default models: the configured EMBED_MODEL and the previous bge-small.
"""
from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

from app.chat import embedding, ingest  # noqa: E402
from app.chat.retrieval.hybrid import rank  # noqa: E402
from app.chat.store import MemoryStore, PgVectorStore  # noqa: E402
from app.content.repository import by_id  # noqa: E402
from app.core.config import get_settings  # noqa: E402

HERE = Path(__file__).parent
DOCS = json.load(open(HERE.parent / "app/content/corpus.json"))["docs"]
GOLDEN = json.load(open(HERE / "golden_set.json"))
K = 4

SETTINGS = {  # name → rank() options
    "dense": {"keyword_weight": 0.0},
    "hybrid": {},  # production constants
}
SWEEP = {
    **{f"rrf kw={w}": {"fusion": "rrf", "keyword_weight": w} for w in (0.0, 0.3, 0.5)},
    "rrf kw=0.5 gate=0": {"fusion": "rrf", "keyword_weight": 0.5, "keyword_gate": 0.0},
    **{
        f"score ctx={c} kw={w}": {"fusion": "score", "context_weight": c, "keyword_weight": w}
        for c in (0.2, 0.3, 0.4, 0.6)
        for w in (0.0, 0.05, 0.1, 0.15, 0.2)
    },
    "score gate=0": {"fusion": "score", "keyword_gate": 0.0},
    "score ctxkw": {"fusion": "score", "context_keyword": True},
}


async def build(name: str, pg: bool):
    model = embedding.load(name)
    store = PgVectorStore() if pg else MemoryStore()
    t0 = time.perf_counter()
    await ingest.sync(store, lambda texts: embedding.embed_passages(model, texts), name, DOCS)
    return store, (lambda text: embedding.embed_query(model, text)), time.perf_counter() - t0


async def evaluate(store, embed_query, **opts) -> dict:
    async def ids(q: str, title: str | None = None) -> list[str]:
        return [r.doc_id for r in await rank(store, embed_query, q, context_title=title, **opts)]

    out: dict = {}
    n_q = 0
    t0 = time.perf_counter()
    for lang in ("en", "ko"):
        r1 = rk = 0
        misses = []
        for case in GOLDEN[lang]:
            got = await ids(case["q"])
            n_q += 1
            expect = set(case["expect"])
            top1, hit = got[0] in expect, bool(set(got[:K]) & expect)
            r1 += top1
            rk += hit
            if not hit:
                misses.append(f"MISS@{K}  {case['q']} → {got[:K]}")
            elif not top1:
                misses.append(f"miss@1   {case['q']} → top1={got[0]} (expected in top{K} ✓)")
        out[lang] = {"r1": r1, "rk": rk, "n": len(GOLDEN[lang]), "misses": misses}
    out["query_ms"] = (time.perf_counter() - t0) / n_q * 1000

    # two-turn: the previous turn's top source is what the server stores as
    # the session's last_sources[0]; its title anchors the follow-up
    fu: dict = {}
    for case in GOLDEN.get("followup", []):
        prev_title = by_id((await ids(case["prev"]))[0])["title"]
        got = await ids(case["q"], prev_title)
        expect = set(case["expect"])
        t = fu.setdefault(case["type"], {"n": 0, "r1": 0, "rk": 0, "misses": []})
        t["n"] += 1
        t["r1"] += got[0] in expect
        t["rk"] += bool(set(got[:K]) & expect)
        if got[0] not in expect:
            t["misses"].append(f"[{case['type']}] {case['prev']} → {case['q']} :: top1={got[0]} (anchor: {prev_title})")
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


def _cell(r: dict) -> str:
    return f"{r['r1']}/{r['n']} {r['rk']}/{r['n']}"


async def main(models: list[str], *, sweep: bool, pg: bool) -> None:
    settings = dict(SETTINGS, **(SWEEP if sweep else {}))
    for name in models:
        store, embed_query, t_build = await build(name, pg)
        print(f"\n===== {name}  [{type(store).__name__}]  index build {t_build:.2f}s =====")
        print(f"  {'setting':<26}{'EN r@1 r@4':<14}{'KO r@1 r@4':<14}"
              + "".join(f"{'FU-' + t + ' r@1 r@4':<16}" for t in ("A", "B", "D")) + "ms/q")
        results = {}
        for label, opts in settings.items():
            res = results[label] = await evaluate(store, embed_query, **opts)
            fu = res["followup"]
            print(f"  {label:<26}{_cell(res['en']):<14}{_cell(res['ko']):<14}"
                  + "".join(f"{_cell(fu[t]) if t in fu else '-':<16}" for t in ("A", "B", "D"))
                  + f"{res['query_ms']:.0f}")
        for label in ("dense", "hybrid"):
            res = results[label]
            lines = res["en"]["misses"] + res["ko"]["misses"] + [
                m for t in sorted(res["followup"]) for m in res["followup"][t]["misses"]
            ]
            if lines:
                print(f"  -- {label} misses --")
                for m in lines:
                    print("      ·", m)
        print(f"  peak RSS (fresh process, load+embed): {peak_rss_mb(name)} MB")


if __name__ == "__main__":
    args = sys.argv[1:]
    sweep, pg = "--sweep" in args, "--pg" in args
    models = [a for a in args if not a.startswith("--")]
    if pg:
        if not get_settings().database_url.startswith("postgresql"):
            sys.exit("--pg needs DATABASE_URL=postgresql+asyncpg://... (the dev stack: port 5433)")
        models = [get_settings().embed_model]  # never re-embed the shared DB with another model
    asyncio.run(main(models or [get_settings().embed_model, "BAAI/bge-small-en-v1.5"], sweep=sweep, pg=pg))
