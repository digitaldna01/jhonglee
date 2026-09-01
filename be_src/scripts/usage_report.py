"""What the chat costs — token usage and estimated spend from chat_logs.

    cd be_src && PYTHONPATH=. .venv/bin/python scripts/usage_report.py [--since 30d]
    docker compose exec -T backend python scripts/usage_report.py          # on the Pi

Per day: questions, how many a model answered (vs extractive fallbacks),
input/output tokens, estimated USD at list price; then totals and a
30-day projection from the period's daily average. Answers whose
output_tokens sit exactly at CHAT_MAX_TOKENS are counted as "capped" —
almost certainly cut mid-sentence, so non-zero means the prompt's
length rules (or the cap) need another look. The console's usage
graph is the bill of record — this is the per-question view it lacks
(and it works from the Pi without a browser).
"""
from __future__ import annotations

import asyncio
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.chat.generation import CHAT_MAX_TOKENS
from app.chat.models import ChatLog
from app.core.db import session_factory

# USD per 1M tokens (input, output) — list prices, 2026-08. Unknown models cost None.
PRICES: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-sonnet-4-6": (3.00, 15.00),
}


def cost_usd(model: str, input_tokens: int | None, output_tokens: int | None) -> float | None:
    price = PRICES.get(model)
    if price is None or input_tokens is None or output_tokens is None:
        return None
    return (input_tokens * price[0] + output_tokens * price[1]) / 1_000_000


def summarize(rows: list[dict], cap: int = CHAT_MAX_TOKENS) -> dict:
    """rows: {created_at, model, input_tokens, output_tokens} → per-day stats + totals (pure)."""
    days: dict[str, dict] = defaultdict(lambda: {"questions": 0, "answered": 0, "in": 0, "out": 0, "usd": 0.0, "unpriced": 0, "capped": 0})
    for r in rows:
        d = days[r["created_at"].astimezone(timezone.utc).date().isoformat()]
        d["questions"] += 1
        if r["input_tokens"] is None:
            continue  # extractive fallback: no model call, no cost
        d["answered"] += 1
        d["in"] += r["input_tokens"]
        d["out"] += r["output_tokens"] or 0
        if r["output_tokens"] == cap:
            d["capped"] += 1  # exactly at the cap → almost certainly cut mid-sentence
        c = cost_usd(r["model"], r["input_tokens"], r["output_tokens"])
        if c is None:
            d["unpriced"] += 1
        else:
            d["usd"] += c
    ordered = [{"date": k, **v} for k, v in sorted(days.items())]
    total: dict[str, float] = {
        key: sum(d[key] for d in ordered) for key in ("questions", "answered", "in", "out", "usd", "unpriced", "capped")
    }
    span = max(len(ordered), 1)
    total["usd_per_answer"] = total["usd"] / total["answered"] if total["answered"] else 0.0
    total["usd_30d_projection"] = total["usd"] / span * 30
    return {"days": ordered, "total": total}


def parse_since(text: str) -> datetime | None:
    if text == "all":
        return None
    n, unit = int(text[:-1]), text[-1]
    return datetime.now(timezone.utc) - {"h": timedelta(hours=n), "d": timedelta(days=n), "w": timedelta(weeks=n)}[unit]


async def load_rows(since: datetime | None) -> list[dict]:
    stmt = select(ChatLog.created_at, ChatLog.model, ChatLog.input_tokens, ChatLog.output_tokens)
    if since is not None:
        stmt = stmt.where(ChatLog.created_at >= since)
    async with session_factory()() as s:
        rows = (await s.execute(stmt)).all()
    return [
        {
            "created_at": c if c.tzinfo else c.replace(tzinfo=timezone.utc),
            "model": m,
            "input_tokens": i,
            "output_tokens": o,
        }
        for c, m, i, o in rows
    ]


def main(argv: list[str]) -> None:
    since_text = argv[argv.index("--since") + 1] if "--since" in argv else "30d"
    rep = summarize(asyncio.run(load_rows(parse_since(since_text))))
    print(f"{'date':<12}{'questions':>10}{'answered':>10}{'in tok':>10}{'out tok':>10}{'USD':>9}")
    for d in rep["days"]:
        notes = [t for t in (d["unpriced"] and f"{d['unpriced']} unpriced", d["capped"] and f"{d['capped']} capped") if t]
        flag = f"  ({', '.join(notes)})" if notes else ""
        print(f"{d['date']:<12}{d['questions']:>10}{d['answered']:>10}{d['in']:>10}{d['out']:>10}{d['usd']:>9.4f}{flag}")
    t = rep["total"]
    print(f"{'total':<12}{t['questions']:>10}{t['answered']:>10}{t['in']:>10}{t['out']:>10}{t['usd']:>9.4f}")
    capped = int(t["capped"])
    print(f"answers at the {CHAT_MAX_TOKENS}-token cap: {capped}"
          + ("  — likely cut mid-sentence; check the prompt's length rules" if capped else ""))
    print(f"since {since_text}: ${t['usd']:.4f}  ·  ${t['usd_per_answer']:.5f} per answered question"
          f"  ·  30-day projection ${t['usd_30d_projection']:.2f}")


if __name__ == "__main__":
    main(sys.argv[1:])
