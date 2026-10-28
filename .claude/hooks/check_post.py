#!/usr/bin/env python3
"""Mechanical checks for fe_src/src/posts/*.mdx — the rules a script can count.

    python3 .claude/hooks/check_post.py fe_src/src/posts/<slug>.mdx [...]
    python3 .claude/hooks/check_post.py --hook     # PostToolUse: reads the tool call on stdin

The judgement rules (calques, rhythm, structure) stay with the ko-reviewer agent and
blog-analyze; this only catches what breaks rendering or what the guides ban outright.
In --hook mode findings go back to Claude as context; it never blocks the edit.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POSTS = ROOT / "fe_src/src/posts"
PUBLIC = ROOT / "fe_src/public"

REQUIRED = ("title", "date", "category", "subcategory", "excerpt")
CATEGORIES = {"PROJECTS", "POST"}
SUBCATEGORIES = {"logical", "visual", "blog", "gallery"}  # = the WORK filters (pages/Work.jsx)
MEDIA = {"figure", "artwork"}
LEANS = {"ml", "design", "research", "art"}

# announcing the artifact below — banned 2026-09-05
EMCEE = ("감상하시죠", "같이 보시죠", "함께 보시죠", "부터 볼게요", "살펴보시죠")
HANGUL = "가-힣"
# `_책 제목_에` — closing _ followed by a particle is not emphasis (intraword rule)
UNDERSCORE_EM = re.compile(rf"(?<![\w*])_[^_\s][^_\n]*?_[{HANGUL}]")
# `*용어(원어)*였다` — closing * after punctuation with a particle attached
STAR_PUNCT = re.compile(rf"\*[^*\s][^*\n]*?[)\]」』\"'”’]\*[{HANGUL}]")
SENTENCE_END = re.compile(rf"([{HANGUL}]{{1,3}})[.?!]?[)\"'”’]*$")


def frontmatter(lines: list[str]) -> tuple[dict[str, str], int]:
    if not lines or lines[0].strip() != "---":
        return {}, 0
    fm: dict[str, str] = {}
    for i, line in enumerate(lines[1:], 1):
        if line.strip() == "---":
            return fm, i + 1
        m = re.match(r"^([A-Za-z]\w*):\s*(.*)$", line)
        if m:
            fm[m.group(1)] = m.group(2).strip()
    return fm, 0


def check(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    out: list[str] = []

    fm, body_start = frontmatter(lines)
    if not body_start:
        return ["frontmatter: missing or unterminated"]
    for key in REQUIRED:
        if key not in fm:
            out.append(f"frontmatter: `{key}` missing")
    if "date" in fm and not re.fullmatch(r"""(['"])\d{4}-\d{2}-\d{2}\1""", fm["date"]):
        out.append(f"frontmatter: date must be a quoted 'YYYY-MM-DD' (got {fm['date']})")
    for key, allowed in (("category", CATEGORIES), ("subcategory", SUBCATEGORIES),
                         ("medium", MEDIA), ("lean", LEANS)):
        if key in fm and fm[key] not in allowed:
            out.append(f"frontmatter: {key}={fm[key]!r} not in {sorted(allowed)}")
    thumb = fm.get("thumbnail", "").strip("'\"")
    if thumb.startswith("/") and not (PUBLIC / thumb.lstrip("/")).exists():
        out.append(f"frontmatter: thumbnail {thumb} not found under fe_src/public")

    locale = None  # None = outside any <Lang>; a post without locales is one language
    bilingual = "locales" in fm
    fenced = False
    endings: list[tuple[int, str]] = []  # (line no, last ≤3 syllables) of KO sentences in a paragraph
    for no, line in enumerate(lines[body_start:], body_start + 1):
        s = line.strip()
        if s.startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            continue
        m = re.match(r'<Lang\s+locale="(\w+)"', s)
        if m:
            locale = m.group(1)
        if s.startswith("</Lang>"):
            locale = None
            endings.clear()
            continue

        if re.match(r"^(#|##|####)\s", s):
            out.append(f"L{no}: only ### (and ##### labels) — the frontmatter makes the page title")
        for src in re.findall(r'src="(/[^"]+)"', s):
            if not (PUBLIC / src.lstrip("/")).exists():
                out.append(f"L{no}: {src} not found under fe_src/public")

        korean = locale == "ko" or (not bilingual and re.search(f"[{HANGUL}]", s))
        if not korean or not s or s.startswith(("import ", "<", "{/*")):
            if not s:
                endings.clear()
            continue

        for phrase in EMCEE:
            if phrase in s:
                out.append(f"L{no}: emcee lead-in “{phrase}” — place the artifact without announcing it")
        if UNDERSCORE_EM.search(s):
            out.append(f"L{no}: `_강조_`+조사 does not render as emphasis — use *별표*")
        if STAR_PUNCT.search(s):
            out.append(f"L{no}: `*…)*`+조사 does not render — move the bracket outside: *용어*(원어)")
        label = s.startswith(("-", "*", "|", "#")) or re.match(r"^\d+\.", s)
        if "—" in s and not label:
            out.append(f"L{no}: 줄표(—) in Korean prose — 마침표로 끊거나 쉼표·괄호로")

        for sentence in re.split(r"(?<=[.?!])\s+", s):
            m = SENTENCE_END.search(sentence.strip())
            if not m:
                continue
            endings.append((no, m.group(1)))  # 3 syllables: 했습니다 ≠ 입니다
            if len(endings) >= 3 and len({e for _, e in endings[-3:]}) == 1:
                out.append(f"L{no}: 같은 어미 3연속 “~{endings[-1][1]}” (L{endings[-3][0]}–L{no})")
                endings.clear()
    return out


def main() -> int:
    if sys.argv[1:] == ["--hook"]:
        call = json.load(sys.stdin)
        path = Path(call.get("tool_input", {}).get("file_path", ""))
        if path.suffix != ".mdx" or POSTS not in path.resolve().parents:
            return 0
        findings = check(path)
        if findings:
            rel = path.resolve().relative_to(ROOT)
            note = (f"check_post.py on {rel} ({len(findings)}):\n" + "\n".join(findings[:25])
                    + "\nFix rendering/frontmatter problems you introduced. Style findings in text "
                      "the owner is still revising: mention them, don't rewrite unasked.")
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PostToolUse", "additionalContext": note}}))
        return 0

    paths = [Path(p) for p in sys.argv[1:]] or sorted(POSTS.glob("*.mdx"))
    total = 0
    for p in paths:
        findings = check(p)
        total += len(findings)
        for f in findings:
            print(f"{p.name}: {f}")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
