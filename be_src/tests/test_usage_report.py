"""scripts/usage_report.py — cost maths over chat_logs rows (pure)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import usage_report as ur  # scripts/ is on the path (pyproject.toml)

T0 = datetime(2026, 8, 29, 12, 0, tzinfo=timezone.utc)


def _row(model, i, o, *, day=0):
    return {"created_at": T0 + timedelta(days=day), "model": model, "input_tokens": i, "output_tokens": o}


def test_cost_uses_list_prices_and_none_for_unknown():
    assert ur.cost_usd("claude-haiku-4-5", 1_000_000, 0) == 1.0
    assert ur.cost_usd("claude-haiku-4-5", 1500, 300) == (1500 * 1.0 + 300 * 5.0) / 1e6
    assert ur.cost_usd("some-new-model", 10, 10) is None
    assert ur.cost_usd("claude-haiku-4-5", None, None) is None


def test_summarize_groups_by_day_skips_fallbacks_and_projects():
    rows = [
        _row("claude-haiku-4-5", 1500, 300),
        _row("claude-haiku-4-5", 1500, 300),
        _row("retrieval-only (model unavailable)", None, None),  # no model call → no cost, still a question
        _row("mystery-model", 100, 100, day=1),
    ]
    rep = ur.summarize(rows)
    d0, d1 = rep["days"]
    assert d0["date"] == "2026-08-29" and d0["questions"] == 3 and d0["answered"] == 2
    assert d0["in"] == 3000 and d0["out"] == 600 and abs(d0["usd"] - 0.006) < 1e-9
    assert d1["answered"] == 1 and d1["unpriced"] == 1 and d1["usd"] == 0.0
    t = rep["total"]
    assert t["questions"] == 4 and t["answered"] == 3
    assert abs(t["usd_per_answer"] - 0.002) < 1e-9
    assert abs(t["usd_30d_projection"] - 0.006 / 2 * 30) < 1e-9
