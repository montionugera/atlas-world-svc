---
title: "Remove stray root files and deploy_ios.py, keep the ten root plans in the archive"
id: I-302
status: idea
---

# Remove stray root files and deploy_ios.py, keep the ten root plans in the archive

## Problem

The repo root carries files nobody reads (owner, 2026-11-14: "it has a lot of unused things and is hard to use"):

- `scripts/deploy_ios.py`: iOS deploy helper, no caller; the owner approved deleting it on 2026-11-15 (the three Mac launchers stay).
- `godot-client-spike/`: 12 generated C# files, each superseded by a same-named file under `game-client/`.
- `info`: a blockout render PNG without an extension, no reader.
- `discover/`: 4 output files of an old art-forge loop, no reader.
- `refined_backlog/F-095..F-110/plan.md` (10 files) at the root: the real plans, while their twins under `.claude/refined_backlog/_archive/1.15/` are 3-line placeholders.
- `HANDOFF-2026-07-15.md`, `HANDOFF-2026-08-30.md` at the root (finished handoffs).

## Why now

Release 1.34 is the cleanup release (F-214, F-215 already shipped).

## Sketch

Delete the four dead things, move the ten real plans over their archive placeholders, move the two old handoffs to `docs/archive/`. Keep `HANDOFF-2026-07-28.md` (linked from `atelier/art-forge/README.md:9`), `client/react-client`, the Mac launchers, `art-source/` and everything under `atelier/asset-forge/scripts/`.

## Acceptance criteria

- [ ] `scripts/deploy_ios.py`, `godot-client-spike/`, `info` and `discover/` no longer exist in the tree.
- [ ] The root `refined_backlog/` folder is gone and each of the 10 archive `plan.md` files under `.claude/refined_backlog/_archive/1.15/F-095..F-110*/` holds the full plan (more than 3 lines).
- [ ] `HANDOFF-2026-07-15.md` and `HANDOFF-2026-08-30.md` live in `docs/archive/`; `HANDOFF-2026-07-28.md` stays at the root.
- [ ] `git grep` finds no live reference (outside `docs/`, `.claude/`, `graft/`) to any removed name.
- [ ] `npm test --prefix scripts` and `./scripts/fastcheck.sh` pass.
