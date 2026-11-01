---
title: "Docs cleanup: fix stale Colyseus text, archive completed plans and dead docs"
id: F-166
status: refined
from_idea: I-244
---

# Docs cleanup: fix stale Colyseus text, archive completed plans and dead docs

## Problem

Agents read `CLAUDE.md` / `README.md` first. Both describe a `colyseus-server/` that has no tracked files and no directory on disk (pnpm-workspace lists only client, contracts, nakama; the server is `server-rs/`). Completed plans, specs and dated handoffs add context noise. Scouts (2026-11-01) found no gate, test, include_str! or CI step that reads the files below.

## Why now

Owner request (2026-11-01): reduce context from legacy/unused/outdated files. Story content (Widow, Millcross, town conflict) is canon-linked and OUT OF SCOPE here.

## Sketch

- Trim the Colyseus-era sections of `CLAUDE.md` and `README.md` (and note server-rs as the authoritative server); keep every still-true invariant.
- `git mv` to `docs/archive/` (history kept): `docs/API.md`, `docs/HANDOFF-2026-07-22.md`, `docs/backlog-overview-2026-07-28.md`, `docs/superpowers/plans/2026-06-20-simplify-refactor*.md` (4), `docs/superpowers/plans/2026-07-22-narrative-system-v2.md`, `docs/superpowers/plans/2026-07-22-epic-story-pipeline.md`, `docs/superpowers/specs/2026-07-22-narrative-system-v2-design.md`, `docs/superpowers/specs/2026-07-22-epic-story-pipeline-design.md`, `.cursor/plans/01-weapon-ws-loadout/`.
- Add one line to `CLAUDE.md`: do not read `docs/story/undertow/` or `docs/archive/` unless the task needs them.
- NOT touched: `content/story/*`, `docs/story/*`, `docs/worldbuilding/*`, `docs/research/*`, bible.md, any file a gate reads.

## Acceptance criteria

- [ ] `CLAUDE.md` and `README.md` no longer instruct running or building `colyseus-server/`, and name `server-rs/` as the authoritative server.
- [ ] Every listed file exists under `docs/archive/` (moved with git mv) and is gone from its old path; nothing else is moved or deleted.
- [ ] `grep -r` for each moved basename finds no inbound reference outside `docs/archive/`, or the reference is updated.
- [ ] Gate 1 passes (the server-rs section shows SKIP, since no rust-relevant path changed).
- [ ] `CLAUDE.md` contains the "do not read docs/story/undertow/ or docs/archive/ unless needed" line.
