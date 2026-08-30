"""Mine golden-set candidates from chat_logs — the questions real visitors asked.

    cd be_src && PYTHONPATH=. .venv/bin/python scripts/mine_golden.py [--since 30d] [--all] [--out FILE|-]
    python scripts/mine_golden.py --merge          # after labelling: append to golden_set.json
    # on the Pi (the container's files are ephemeral — write to stdout, keep the file on your machine):
    ssh pi 'cd jhonglee && docker compose exec -T backend python scripts/mine_golden.py --out -' > be_src/scripts/golden_candidates.json

Workflow
  1. mine   → scripts/golden_candidates.json: every logged question not yet in
             the golden set, with what retrieval returned (`got`), its top
             cosine, the previous question of the same session (`prev`, so a
             follow-up can become a two-turn case) and flags that hint at a
             failure: low-score, fallback (no Claude answer), repeat (asked
             again in the same session → the first answer was not it).
  2. label  → open the file, fill `expect` with the doc id(s) that *should* have
             come first; delete the cases that do not matter. `got` is only the
             system's guess — a candidate is not a failure until you say so.
  3. merge  → --merge appends the labelled ones to golden_set.json (lang bucket
             by script, `followup` when `prev` is set — give it a `type`:
             A ellipsis, B topic switch, D language switch) and drops them from
             the candidates file. Then run eval_retrieval.py.

The retrieval index needs no database (eval builds its own); this script
reads chat_logs from DATABASE_URL — Postgres in Docker, SQLite otherwise.
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

from app.chat.models import ChatLog
from app.core.db import session_factory

HERE = Path(__file__).parent
GOLDEN_PATH = HERE / "golden_set.json"
CANDIDATES_PATH = HERE / "golden_candidates.json"

LOW_SCORE = 0.2  # best cosine below this: retrieval probably found nothing relevant
FOLLOWUP_WINDOW = timedelta(minutes=30)  # a question this soon after another is a follow-up
TOP = 4
_HANGUL = re.compile(r"[가-힣]")


def lang(question: str) -> str:
    return "ko" if _HANGUL.search(question) else "en"


def golden_questions(golden: dict) -> set[str]:
    out = set()
    for key, cases in golden.items():
        if isinstance(cases, list):
            out.update(c["q"].strip().casefold() for c in cases)
    return out


def mine(rows: list[dict], golden: dict, *, include_known: bool = False) -> list[dict]:
    """Candidates from chat_logs rows (dicts with the ChatLog columns), oldest first.

    Pure: no database, so it is testable and the same on Postgres/SQLite."""
    known = golden_questions(golden)
    sessions: dict[tuple[str, str | None], list[dict]] = {}
    for r in sorted(rows, key=lambda r: r["created_at"]):
        sessions.setdefault((r["visitor_id"], r["session_id"]), []).append(r)

    out: list[dict] = []
    for turns in sessions.values():
        seen: set[str] = set()
        for i, r in enumerate(turns):
            q = r["question"].strip()
            prev = turns[i - 1] if i and r["created_at"] - turns[i - 1]["created_at"] <= FOLLOWUP_WINDOW else None
            got = [s["id"] for s in r["sources"][:TOP]]
            top = max((float(s.get("score", 0.0)) for s in r["sources"]), default=0.0)
            flags = []
            if top < LOW_SCORE:
                flags.append("low-score")
            if "claude" not in r["model"].lower():
                flags.append("fallback")
            if q.casefold() in seen:
                flags.append("repeat")
            seen.add(q.casefold())
            if q.casefold() in known and not include_known:
                continue
            out.append(
                {
                    "q": q,
                    "lang": lang(q),
                    "got": got,
                    "top_score": round(top, 3),
                    "flags": flags,
                    "prev": prev["question"].strip() if prev else None,
                    "type": "A" if prev else None,
                    "when": r["created_at"].isoformat(timespec="minutes"),
                    "expect": [],
                }
            )
    return out


def merge(candidates: list[dict], golden: dict) -> tuple[int, list[dict]]:
    """Append labelled candidates (non-empty `expect`) to the golden dict.
    Returns (added, the candidates left unlabelled)."""
    known = golden_questions(golden)
    added, rest = 0, []
    for c in candidates:
        if not c.get("expect"):
            rest.append(c)
            continue
        if c["q"].strip().casefold() in known:
            continue
        if c.get("prev"):
            golden.setdefault("followup", []).append(
                {"type": c.get("type") or "A", "prev": c["prev"], "q": c["q"], "expect": c["expect"]}
            )
        else:
            golden.setdefault(c.get("lang") or lang(c["q"]), []).append({"q": c["q"], "expect": c["expect"]})
        known.add(c["q"].strip().casefold())
        added += 1
    return added, rest


def parse_since(text: str) -> datetime | None:
    if text == "all":
        return None
    n, unit = int(text[:-1]), text[-1]
    delta = {"h": timedelta(hours=n), "d": timedelta(days=n), "w": timedelta(weeks=n)}[unit]
    return datetime.now(timezone.utc) - delta


async def load_rows(since: datetime | None) -> list[dict]:
    stmt = select(ChatLog).order_by(ChatLog.created_at)
    if since is not None:
        stmt = stmt.where(ChatLog.created_at >= since)
    async with session_factory()() as s:
        logs = (await s.scalars(stmt)).all()
    return [
        {
            "visitor_id": r.visitor_id,
            "session_id": r.session_id,
            "question": r.question,
            "sources": r.sources or [],
            "model": r.model,
            "created_at": r.created_at if r.created_at.tzinfo else r.created_at.replace(tzinfo=timezone.utc),
        }
        for r in logs
    ]


def _dump(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def main(argv: list[str]) -> None:
    golden = json.loads(GOLDEN_PATH.read_text())
    if "--merge" in argv:
        candidates = json.loads(CANDIDATES_PATH.read_text()) if CANDIDATES_PATH.exists() else []
        added, rest = merge(candidates, golden)
        _dump(GOLDEN_PATH, golden)
        _dump(CANDIDATES_PATH, rest)
        print(f"merged {added} labelled case(s) into {GOLDEN_PATH.name}; {len(rest)} left in {CANDIDATES_PATH.name}")
        return

    since = parse_since(argv[argv.index("--since") + 1] if "--since" in argv else "30d")
    out = argv[argv.index("--out") + 1] if "--out" in argv else str(CANDIDATES_PATH)
    rows = asyncio.run(load_rows(since))
    candidates = mine(rows, golden, include_known="--all" in argv)
    if out == "-":
        print(json.dumps(candidates, ensure_ascii=False, indent=2))
        report = sys.stderr
    else:
        _dump(Path(out), candidates)
        report = sys.stdout

    flagged = [c for c in candidates if c["flags"]]
    print(f"{len(rows)} logged question(s) → {len(candidates)} candidate(s) "
          f"(en {sum(c['lang'] == 'en' for c in candidates)}, ko {sum(c['lang'] == 'ko' for c in candidates)}, "
          f"follow-ups {sum(bool(c['prev']) for c in candidates)}, flagged {len(flagged)}) → {out}", file=report)
    for c in candidates:
        mark = ",".join(c["flags"]) or "-"
        prev = f"   ⤷ after: {c['prev']}" if c["prev"] else ""
        print(f"  [{c['lang']}] {c['top_score']:.2f} {mark:<18} {c['q']}  →  {c['got'][:2]}{prev}", file=report)


if __name__ == "__main__":
    main(sys.argv[1:])
