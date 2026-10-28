#!/usr/bin/env python3
"""PostToolUse(Edit|Write): eslint the edited fe_src .js/.jsx file (~1 s).

Exit 2 puts eslint's report in front of Claude; the edit itself has already happened.
"""
import json
import subprocess
import sys
from pathlib import Path

FE = Path(__file__).resolve().parents[2] / "fe_src"

path = Path(json.load(sys.stdin).get("tool_input", {}).get("file_path", "")).resolve()
if path.suffix not in (".js", ".jsx", ".mjs") or FE not in path.parents or "node_modules" in path.parts:
    sys.exit(0)

run = subprocess.run(["npx", "--no-install", "eslint", str(path)], cwd=FE, capture_output=True, text=True)
if run.returncode == 1:  # 1 = lint errors; 2 = eslint itself failed, not the edit's fault
    print(run.stdout.strip(), file=sys.stderr)
    sys.exit(2)
