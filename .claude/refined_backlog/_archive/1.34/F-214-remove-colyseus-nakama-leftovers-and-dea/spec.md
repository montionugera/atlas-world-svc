---
title: "Remove Colyseus/Nakama leftovers and dead root files"
id: F-214
status: refined
from_idea: I-297
---

# Remove Colyseus/Nakama leftovers and dead root files

Owner approved this list on 2026-11-14 (cleanup audit, batch "Colyseus/Nakama leftovers").
Audit evidence: `~/.local/state/atlas-lane/cleanup-audit-2026-11-14/audit-A-legacy.md`.

## Problem

The Colyseus server and the Nakama TypeScript runtime were removed (F-064 and later), but
six tracked files still describe or serve them. None is referenced by code, a gate, CI,
a Dockerfile or `scripts/deploy-local.sh` (re-checked with `git grep` on release/1.34,
excluding `.claude/`, `docs/superpowers/`, `graft/`):

| File | Why it is dead |
|---|---|
| `migrate.sh` | Only echoes that migrations are handled by server-rs. 0 references. |
| `plan.md` | The finished F-064 "delete colyseus-server" plan. The two `plan.md` hits in `scripts/` are prose comments about other plans. |
| `docker-compose.yml` | Its only service builds `colyseus-server/Dockerfile`, a folder that no longer exists. It cannot run. |
| `k8s/local/colyseus-server.yaml` | Deploys an image no build produces. `deploy-local.sh` does not apply it. 0 references. |
| `client/package-lock.json` | Lockfile at a level with no `package.json`. 0 references. |
| `nakama/.cookie` | 16 bytes of binary, the last file in `nakama/`. 0 references. Looks like a key; it has been public since 2026-11-09. |

`README.md` still advertises two of them: line 326 (`monitoring/`, a folder that does not
exist) and line 327 (`docker-compose.yml` as "Complete local orchestration setup"), plus
line 188 lists "Docker & Docker Compose" as a prerequisite.

## Scope

1. `git rm` the six files above (this removes the `nakama/` folder).
2. `README.md`: delete the `monitoring/` and `docker-compose.yml` rows of the Project
   Structure table; change the prerequisite on line 188 to "Docker".

## Out of scope (separate owner decisions, do not touch here)

- `.cursor/` (its rules still mention docker-compose; the whole folder is a pending decision).
- `k8s/local/config.yaml` still named `colyseus-server-config` (live, applied by deploy-local.sh).
- `game-client/scripts/check-contracts-drift.sh:21`, the `Colyseus` NuGet pin, `client/react-client`, `contracts/` comments.
- The Nakama-compatible `/v2/*` API and `NAKAMA_*` env vars in server-rs: a live feature, not a leftover.
- Rotating whatever `nakama/.cookie` was a key for: nothing references it, so there is nothing to rotate in this repo. Deleting does not remove it from git history.

## Acceptance criteria

- [ ] A1: none of the six paths exists in the tree (`git ls-files` returns nothing for them).
- [ ] A2: `git grep -n "docker-compose.yml\|monitoring/" -- README.md` returns nothing.
- [ ] A3: `./scripts/precheck.sh` (Gate 1) passes.
- [ ] A4: `bash -n scripts/deploy-local.sh` passes and it still references only files that exist under `k8s/local/`.

## Undo

`git revert` of the feature's squash commit restores every file.
