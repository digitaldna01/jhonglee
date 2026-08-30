"""Answer-quality A/B — two system prompts, the same retrieval, an LLM judge.

    cd be_src && set -a && source ../.env && set +a && \\
      PYTHONPATH=. .venv/bin/python scripts/judge_answers.py [--a v1 --b current]
        --questions scripts/eval_questions.json   the question set (two-turn cases via `prev`)
        --rubric FILE       your own voice rubric (plain text) instead of the default one
        --judge MODEL       judge model (default claude-sonnet-5; the answerer is CHAT_MODEL)
        --limit N           first N questions only (a cheap dry run)
        --only A1,E25       just these question ids
        --out FILE          full transcript + verdicts as JSON (default scripts/judge_out.json)
        --reuse FILE        re-judge the answers saved in FILE (e.g. with another rubric) instead of
                            generating them again

What it measures, per question, for each variant:
  grounded   every claim in the answer traceable to the retrieved documents —
             the judge lists the claims it cannot support (RAGAS-style faithfulness)
  pairwise   which of the two answers better fits the rubric (tone, length fit,
             warmth, persona), judged side by side with the order shuffled so
             position bias cancels — absolute scores drift, preferences don't
  tokens     output length, so "longer" is a number, not an impression

Retrieval is shared between the variants, so a difference is the prompt's.
Answers come from the production path (retrieval.retrieve → generation.generate)
with the variant's system prompt swapped in; nothing here changes what ships.
Costs about $0.55 for the 27-question set (54 Haiku answers + 81 Sonnet verdicts).

Variants live in VARIANTS below: "current" is prompts.SYSTEM_PROMPT, "v1" the
prompt it replaced; a candidate is edited here until it wins, then moves into
prompts.py.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
import warnings
from pathlib import Path
from typing import Literal

warnings.filterwarnings("ignore")

import anthropic  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from app.chat import generation, retrieval, rewrite  # noqa: E402
from app.chat.prompts import SYSTEM_PROMPT, build_context  # noqa: E402
from app.chat.service import TOP_K  # noqa: E402
from app.core.config import get_settings  # noqa: E402

HERE = Path(__file__).parent
JUDGE_MODEL = "claude-sonnet-5"
CONCURRENCY = 4

# ---- prompt variants ---------------------------------------------------------
# "current" is what ships (prompts.SYSTEM_PROMPT); "v1" is the prompt it replaced on
# 2026-08-30, kept so a later candidate can be checked against both. A candidate
# is added here, judged against current, and moves into prompts.py when it wins.
V1 = (
    'You are the assistant on Jae Hong Lee\'s portfolio site, answering in first person as Jae ("I…"). '
    "Each question comes with <documents> from the site, most relevant first. "
    "Answer in 2-3 short sentences. Ground every statement ONLY in those documents; "
    "never invent facts, opinions, feelings or preferences for Jae. "
    "If something isn't covered, say it isn't covered here — don't confirm or deny it — and point to what is. "
    "Refer to any project by its exact title. Plain text only: no markdown, no bullet lists, no headings. "
    "Be plain and specific — no marketing language. "
    'This may be a follow-up in an ongoing conversation; when the question says "it" or "that", '
    "it means the topic named after the question, not another document. "
    "Answer in the language of the latest question, even if earlier turns were in another language. "
    "In Korean, use polite 해요체 consistently."
)
VARIANTS = {"current": SYSTEM_PROMPT, "v1": V1}


DEFAULT_RUBRIC = """\
The answers are written in the first person by Jae Hong Lee, a design engineer, on his own public portfolio
site, for recruiters, collaborators and strangers with no prior knowledge of him. A good answer:
1. Is grounded: every statement traces to the documents; it never invents facts, opinions or feelings, and it
   does not repeat the about page's phrasing word for word.
2. Conclusion first, then the reason. Short sentences, two to four by default; up to five with one concrete
   detail for a "how did you" question. Padding and repetition are worse than brevity.
3. Understated and warm like a colleague: no hype words, no emoji, at most one exclamation mark, no marketing
   register. Opinions are hedged; facts about the work are stated plainly.
4. When something isn't covered: says so in one sentence and offers the nearest thing that is covered, without
   confirming or denying the point. Private or off-topic questions: declined in one sentence, redirected to
   the work, no moralizing or over-apologizing. Contact: points to the site's links, never guesses an address.
   Asked whether it is a real person: says plainly that it is an AI answering as Jae.
5. Uses the question's language (Korean or English; other languages get English). Korean is 해요체 throughout —
   never 반말, never ~습니다 — with correct spacing and standard spelling. English has correct grammar.
6. Plain prose: no markdown, headers or bullet lists. Doesn't end every turn with a question.
"""


# ---- judge output shapes -------------------------------------------------------
class Claim(BaseModel):
    claim: str
    supported: bool
    note: str


class Faithfulness(BaseModel):
    claims: list[Claim]


Side = Literal["1", "2", "tie"]


class Pairwise(BaseModel):
    winner: Side
    tone: Side  # which reads more like a person
    length_fit: Side
    not_covered_handling: Literal["1", "2", "tie", "n/a"]  # n/a when both answer directly
    reason: str


# ---- answering through the production path -------------------------------------
async def answer(question: str, retrieved: list[dict], history: list[dict], topic: str | None, system: str) -> dict:
    parts: list[str] = []
    usage: dict = {}
    async for name, payload in generation.generate(question, retrieved, history, topic=topic, system=system):
        if name == "delta":
            parts.append(payload["text"])
        elif name == "done":
            usage = {k: payload.get(k) for k in ("input_tokens", "output_tokens")}
            if not payload.get("output_tokens"):
                raise RuntimeError(f"no model answer ({payload.get('model')}) — is ANTHROPIC_API_KEY set?")
    return {"text": "".join(parts), **usage}


async def run_case(case: dict, variants: dict[str, str]) -> dict:
    """Retrieve once, answer with every variant; a `prev` turn is answered per
    variant too (its answer is that variant's own history)."""
    out: dict = {"id": case["id"], "q": case["q"], "prev": case.get("prev"), "answers": {}}
    prev_hist: dict[str, list[dict]] = {v: [] for v in variants}
    topic = None
    if case.get("prev"):
        prev_docs = await retrieval.retrieve(await rewrite.search_query(case["prev"], []) or case["prev"], k=TOP_K)
        topic = prev_docs[0]["title"] if prev_docs else None
        for v, system in variants.items():
            a = await answer(case["prev"], prev_docs, [], None, system)
            prev_hist[v] = [{"role": "user", "content": case["prev"]}, {"role": "assistant", "content": a["text"]}]
            out["answers"].setdefault(v, {})["prev_answer"] = a["text"]
    # production's retrieval path: Korean / follow-ups are searched as an English
    # query (the first variant's history stands in — the rewrite sees one conversation)
    query, anchor = await rewrite.search_plan(case["q"], next(iter(prev_hist.values())), topic=topic)
    retrieved = await retrieval.retrieve(query, k=TOP_K, context_title=anchor) if query else []
    out["search_query"] = (query or rewrite.NO_RETRIEVAL) if query != case["q"] else None
    out["context"] = build_context(retrieved)
    out["sources"] = [r["title"] for r in retrieved]
    for v, system in variants.items():
        a = await answer(case["q"], retrieved, prev_hist[v], topic, system)
        out["answers"].setdefault(v, {}).update(a)
    return out


# ---- judging ------------------------------------------------------------------
JUDGE_MAX_TOKENS = 8000  # adaptive thinking spends from the same budget as the JSON answer
# facts the system prompt supplies that no document states — the faithfulness judge
# would otherwise count them as inventions
GIVEN = (
    "The answerer is an AI answering as Jae Hong Lee, trained on his work and writing; it answers questions "
    "about the projects and writing on his portfolio site, in English or Korean."
)


async def parse(client: anthropic.AsyncAnthropic, model: str, prompt: str, shape):
    r = await client.messages.parse(model=model, max_tokens=JUDGE_MAX_TOKENS, thinking={"type": "adaptive"},
                                    messages=[{"role": "user", "content": prompt}], output_format=shape)
    if r.parsed_output is None:
        raise RuntimeError(f"judge returned no {shape.__name__} (stop_reason={r.stop_reason})")
    return r.parsed_output


async def judge_faithfulness(client: anthropic.AsyncAnthropic, model: str, case: dict, text: str) -> Faithfulness:
    prompt = (
        "You are checking a portfolio chatbot's answer for faithfulness to its sources.\n"
        "Split the ANSWER into its factual claims (skip pure pleasantries and 'this isn't covered' statements). "
        "For each claim, decide whether the DOCUMENTS or the GIVEN facts support it. Paraphrase is fine; a claim "
        "is unsupported if neither states it, or they state something different.\n\n"
        f"<given>{GIVEN}</given>\n<question>{case['q']}</question>\n{case['context']}\n<answer>{text}</answer>"
    )
    return await parse(client, model, prompt, Faithfulness)


async def judge_pairwise(client: anthropic.AsyncAnthropic, model: str, rubric: str, case: dict,
                         first: str, second: str) -> Pairwise:
    prev = f"<previous_turn>{case['prev']}</previous_turn>\n" if case.get("prev") else ""
    prompt = (
        "Two candidate answers to the same question, from the same sources. Judge them against the RUBRIC "
        "and pick the better one; 'tie' only if they are genuinely equivalent. Ignore which came first.\n\n"
        f"<rubric>\n{rubric}</rubric>\n{prev}<question>{case['q']}</question>\n{case['context']}\n"
        f"<answer_1>{first}</answer_1>\n<answer_2>{second}</answer_2>\n\n"
        "For winner / tone / length_fit / not_covered_handling answer \"1\", \"2\" or \"tie\" "
        "(not_covered_handling: \"n/a\" if both answer the question directly). Keep `reason` to two sentences."
    )
    return await parse(client, model, prompt, Pairwise)


async def judge_case(client: anthropic.AsyncAnthropic, model: str, rubric: str, case: dict, a: str, b: str) -> dict:
    ta, tb = case["answers"][a]["text"], case["answers"][b]["text"]
    swap = random.random() < 0.5  # position bias cancels over the set
    fa, fb, pw = await asyncio.gather(
        judge_faithfulness(client, model, case, ta),
        judge_faithfulness(client, model, case, tb),
        judge_pairwise(client, model, rubric, case, tb if swap else ta, ta if swap else tb),
    )

    def side(v: str) -> str:  # "1"/"2" → variant name, honouring the shuffle
        if v not in ("1", "2"):
            return v
        return (b if v == "1" else a) if swap else (a if v == "1" else b)

    return {
        "unsupported": {
            a: [c.claim for c in fa.claims if not c.supported],
            b: [c.claim for c in fb.claims if not c.supported],
        },
        "winner": side(pw.winner),
        "tone": side(pw.tone),
        "length_fit": side(pw.length_fit),
        "not_covered": side(pw.not_covered_handling),
        "reason": pw.reason,
    }


# ---- report -------------------------------------------------------------------
def report(cases: list[dict], a: str, b: str) -> None:
    w = {a: 0, b: 0, "tie": 0}
    tone = {a: 0, b: 0, "tie": 0}
    unsupported = {a: 0, b: 0}
    tokens = {a: 0, b: 0}
    print(f"\n  {'id':<5}{'tok ' + a[:8]:>14}{'tok ' + b[:8]:>14}{'unsupported':>14}{'winner':>10}{'tone':>10}  reason")
    for c in cases:
        v = c["verdict"]
        for k in (a, b):
            tokens[k] += c["answers"][k]["output_tokens"]
            unsupported[k] += len(v["unsupported"][k])
        w[v["winner"]] = w.get(v["winner"], 0) + 1
        tone[v["tone"]] = tone.get(v["tone"], 0) + 1
        uns = f"{len(v['unsupported'][a])} / {len(v['unsupported'][b])}"
        print(f"  {c['id']:<5}{c['answers'][a]['output_tokens']:>14}{c['answers'][b]['output_tokens']:>14}"
              f"{uns:>14}{v['winner']:>10}{v['tone']:>10}  {v['reason'][:90]}")
    n = len(cases)
    print(f"\n  wins   {a}: {w[a]}  {b}: {w[b]}  tie: {w['tie']}   (of {n})")
    print(f"  tone   {a}: {tone[a]}  {b}: {tone[b]}  tie: {tone['tie']}")
    print(f"  unsupported claims   {a}: {unsupported[a]}  {b}: {unsupported[b]}")
    print(f"  mean output tokens   {a}: {tokens[a] / n:.0f}  {b}: {tokens[b] / n:.0f}")
    flagged = [(c["id"], k, u) for c in cases for k in (a, b) for u in c["verdict"]["unsupported"][k]]
    if flagged:
        print("\n  unsupported claims:")
        for cid, k, u in flagged:
            print(f"    {cid} [{k}] {u}")


async def main(args: argparse.Namespace) -> None:
    settings = get_settings()
    if not settings.anthropic_api_key:
        sys.exit("ANTHROPIC_API_KEY is not set (source ../.env)")
    a, b = args.a, args.b
    variants = {a: VARIANTS[a], b: VARIANTS[b]}
    rubric = Path(args.rubric).read_text() if args.rubric else DEFAULT_RUBRIC
    questions = json.loads(Path(args.questions).read_text())["questions"][: args.limit or None]
    if args.only:
        wanted = set(args.only.split(","))
        questions = [q for q in questions if q["id"] in wanted]

    if not args.reuse:
        await retrieval.warmup()
    print(f"answering {len(questions)} questions × {a}/{b} with {settings.chat_model}; judge {args.judge}")
    sem = asyncio.Semaphore(CONCURRENCY)

    async def guarded(coro):
        async with sem:
            return await coro

    if args.reuse:
        saved = json.loads(Path(args.reuse).read_text())
        if {saved["a"], saved["b"]} != {a, b}:
            sys.exit(f"{args.reuse} holds {saved['a']}/{saved['b']}, not {a}/{b}")
        cases = saved["cases"]
        print(f"reusing {len(cases)} answers from {args.reuse}")
    else:
        cases = await asyncio.gather(*(guarded(run_case(q, variants)) for q in questions))
    save = lambda: Path(args.out).write_text(json.dumps(  # noqa: E731
        {"a": a, "b": b, "answerer": settings.chat_model, "judge": args.judge, "rubric": rubric, "cases": cases},
        ensure_ascii=False, indent=2))
    save()  # answers are the expensive half — keep them even if judging fails
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    verdicts = await asyncio.gather(*(guarded(judge_case(client, args.judge, rubric, c, a, b)) for c in cases))
    for c, v in zip(cases, verdicts):
        c["verdict"] = v
    report(cases, a, b)
    save()
    print(f"\n  full transcript → {args.out}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--a", default="v1", choices=VARIANTS)
    p.add_argument("--b", default="current", choices=VARIANTS)
    p.add_argument("--questions", default=str(HERE / "eval_questions.json"))
    p.add_argument("--rubric")
    p.add_argument("--judge", default=JUDGE_MODEL)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--only")
    p.add_argument("--out", default=str(HERE / "judge_out.json"))
    p.add_argument("--reuse")
    asyncio.run(main(p.parse_args()))
