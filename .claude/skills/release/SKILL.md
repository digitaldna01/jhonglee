---
name: release
description: Ship develop to production — pre-flight checks, the develop → main PR, and watching the deploy on the Raspberry Pi (including the runner-offline recovery). Use when the owner says to release, deploy, open the release PR, or asks why a deploy didn't land.
---

# Release

`main` is PR-only (enforce_admins on, 0 approvals needed). **Merging the PR is the deploy**:
`.github/workflows/deploy.yml` builds the web bundle + LSA artifacts on x86, pushes arm64 images to GHCR,
then the self-hosted runner on the Pi pulls and restarts. Never push, check out, or merge `main` locally.

## 1. Pre-flight (on develop)

- Everything to ship is committed and pushed: `git status`, `git log origin/develop..develop`.
- What ships: `git log --oneline origin/main..origin/develop` and `git diff --stat origin/main...origin/develop`.
- `cd fe_src && npm run lint && npm run build` — both clean.
- Backend touched? `cd be_src && .venv/bin/python -m pytest -q` (~2.5 min).
- Posts touched? The `/post` after-writing checks were done (corpus, golden set).
- **New container, model, dependency, or anything that changes memory** → measure before the Pi does:
  build arm64 images locally (`docker buildx build --platform linux/arm64 …`, override the image tags),
  run the prod `docker-compose.yml` with them, read `docker stats`. That has caught a Dockerfile syntax
  error and a 1.7 GB onnxruntime arena before they reached a 2 GB machine.
- Migrations: a new Alembic revision runs on backend start; say so in the PR.

## 2. The PR

```bash
gh pr create --base main --head develop --title "Release: <the things that ship, comma-separated>" --body "…"
```

Body like #15/#16 (`gh pr view 16`): `## What ships` — one bullet per post/feature, bold name first,
what a visitor sees and the operational facts (artifact sizes, CI or backend changes, memory).
Then anything the owner must do (new secret, migration, manual step). **Don't merge** — the owner merges
when they decide; merge = deploy.

## 3. After the owner merges

- `gh run list --workflow deploy.yml --limit 3`, then `gh run watch <id>` or `gh run view <id> --log-failed`.
- `build-and-push` green but `deploy-on-pi` stuck in *queued* → the runner is offline:
  `gh api repos/digitaldna01/jhonglee/actions/runners`. After a power cycle the runner misreports
  "registration has been deleted" — it hasn't (clock skew, no RTC). **Don't re-register.** Hand the owner:
  `ssh raspberrypi 'cd ~/actions-runner && sudo ./svc.sh start'`.
- Smoke test: `curl -s https://jhonglee.com/api/health`, open the shipped post, ask the chat one question
  about it. Read-only checks on the Pi are fine (`ssh raspberrypi 'docker stats --no-stream; free -h'`);
  state-changing commands go to the owner to paste.
- `develop` stays where it is — no sync-back needed, the next release PR carries on from it.
