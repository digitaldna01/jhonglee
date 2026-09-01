"""Regex style checks for chat answers — the mechanical half of the voice rules.

The pairwise judge drifts ±1 between runs on tone, so a regression on the
rules that ARE mechanical (no 합쇼체, no emoji, at most one exclamation
mark) can hide in its noise. These checks are exact: `judge_answers`
applies them to every generated answer and prints the totals, and
tests/test_style_check.py pins the patterns. Not wired into the production
path — violations are rare enough that a pre-release check is the right place.
"""
from __future__ import annotations

import re

# Word-final banned endings. ~니다 word-final is always 합쇼체 (or 반말 "아니다" —
# banned either way); ~십시오 likewise. ~니까 is 합쇼체 only after a ㅂ-받침
# syllable (합니까/입니까) — the connective ~(으)니까 ("써 보니까") is fine and
# filtered out in check().
_ENDING = re.compile(r"[가-힣]{0,6}(?:니다|니까|십시오)(?=[^가-힣]|$)")
# emoji blocks + variation selector; ordinary punctuation (…, ·, —) is outside these
_EMOJI = re.compile(
    "[\U0001f000-\U0001faff☀-⛿✀-➿⬀-⯿️]"
)
_BANG = re.compile("[!！]")  # ASCII and full-width


def _b_batchim(ch: str) -> bool:
    code = ord(ch) - 0xAC00
    return 0 <= code < 11172 and code % 28 == 17  # final consonant ㅂ


def check(text: str) -> list[str]:
    """Violations of the mechanical voice rules in one answer ([] = clean)."""
    issues: list[str] = []
    endings = []
    for m in _ENDING.finditer(text):
        w = m.group(0)
        if w.endswith("니까") and not w.endswith("습니까"):
            stem = w[:-2]
            if not stem or not _b_batchim(stem[-1]):
                continue  # connective ~(으)니까, not 합쇼체
        endings.append(w)
    if endings:
        issues.append("합쇼체/반말 어미: " + ", ".join(dict.fromkeys(endings)))
    emoji = list(dict.fromkeys(_EMOJI.findall(text)))
    if emoji:
        issues.append("emoji: " + " ".join(emoji))
    bangs = len(_BANG.findall(text))
    if bangs > 1:
        issues.append(f"느낌표 {bangs}개 (최대 1)")
    return issues
