#!/usr/bin/env python3
"""PreToolUse(Bash) guard for the two git mistakes this repo has paid for.

1. Anything that writes to main. main is PR-only (enforce_admins) and a merge
   deploys to the Pi, so pushes, checkouts and merges of main are refused here
   too, before GitHub refuses them. Releases go through `gh pr create`.
2. Switching branches in the main tree. The dev stack bind-mounts fe_src, and a
   mass file swap leaves the running Vite server broken until `restart web`
   (2026-08-30). Creating a branch at the current commit (-b/-c) swaps nothing
   and is allowed; for other branches use a worktree.

Exit 2 blocks the call and shows stderr to Claude.
"""
import json
import re
import shlex
import subprocess
import sys

call = json.load(sys.stdin)
command = call.get("tool_input", {}).get("command", "")


def block(reason: str) -> None:
    print(reason, file=sys.stderr)
    sys.exit(2)


def current_branch() -> str:
    return subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"],
                          capture_output=True, text=True).stdout.strip()


def is_branch(name: str) -> bool:
    for ref in (f"refs/heads/{name}", f"refs/remotes/origin/{name}"):
        if subprocess.run(["git", "show-ref", "--verify", "--quiet", ref]).returncode == 0:
            return True
    return False


for part in re.split(r"&&|\|\||;|\|", command):
    try:
        words = shlex.split(part)
    except ValueError:
        continue
    if not words or words[0] != "git":
        continue
    rest = words[1:]
    worktree = False  # skip global options; `-C <dir>` points elsewhere
    while rest and rest[0].startswith("-"):
        if rest[0] == "-C" and len(rest) > 1:
            worktree = True  # another directory, e.g. a worktree — its own business
            rest = rest[2:]
        else:
            rest = rest[1:]
    if not rest or worktree:
        continue
    sub, args = rest[0], rest[1:]

    if sub == "push" and any(re.search(r"(^|:)(refs/heads/)?main$", a) for a in args):
        block("Blocked: main is PR-only and a merge deploys. Release with "
              "`gh pr create --base main --head develop`; the owner merges.")
    if sub in ("checkout", "switch"):
        if "--" in args:
            continue  # restoring files, not switching
        if any(a in ("-b", "-B", "-c", "-C", "--orphan") for a in args):
            continue
        targets = [a for a in args if not a.startswith("-")]
        if not targets or targets[0] == current_branch():
            continue
        if targets[0] in ("main", "-") or is_branch(targets[0]):
            block(f"Blocked: `git {sub} {targets[0]}` swaps the whole tree under the running "
                  "dev Vite (it loses the MDX transform). The local checkout stays on develop; "
                  "use `git worktree add ../jhonglee-<name> <branch>` instead.")
    if sub == "merge" and current_branch() == "main":
        block("Blocked: merging into main locally — main changes only through a PR.")
