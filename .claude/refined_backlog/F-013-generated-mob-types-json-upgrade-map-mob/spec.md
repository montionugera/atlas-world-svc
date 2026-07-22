---
title: "Generated mob-types.json → upgrade map mobType check from WARN to hard-fail: emit a machine-readable list of valid mob ids from colyseus-server mob definitions (mirror gen-asset-keys codegen), have check_content.mjs read it so a typo in a content map mobSpawnAreas[].mobType (and faction/quest mob refs) is a hard FAIL instead of a silent WARN — closes the silent-empty-spawn risk in authored maps"
id: F-013
from_idea: I-019
status: refined
---

# Generated mob-types.json — mob refs WARN→FAIL — design

**Canonical approved spec:** `docs/superpowers/specs/2026-07-22-mob-types-gate-design.md`
(on `release/1.4`; brainstormed + adversarially reviewed 2026-07-22). This file is a
summary pointer — the canonical spec wins on any conflict.

## Goal

A typo'd mob reference in authored content (map `mobSpawnAreas[].mobType`, story
`faction.mobFamily[]`, quest `objectives[].targetId` of form `mob:*`) is a hard CI
FAIL instead of a silent WARN — closing the silent-empty-spawn bug class.

## Architecture

Mirror the `gen-asset-keys` codegen: `gen-mob-types.{ts,sh}` reads the live
`MOB_TYPES` server config and emits committed, deterministic
`colyseus-server/generated/mob-types.json` (`{version, mobTypes[]}`).
`check_content.mjs` gains a `--mob-types` flag (script-relative default to the
committed artifact) and treats the file as the single source of truth; missing/
unparseable/shape-invalid file is itself one hard FAIL (never soft-skip).

## Components

- `colyseus-server/scripts/codegen/gen-mob-types.ts` + `.sh` — codegen, exports `genMobTypes()`.
- `colyseus-server/generated/mob-types.json` — committed artifact, CI-refreshed.
- `scripts/check_content.mjs` — map step (4) WARN→FAIL; story `mobFamily` + `mob:*` `targetId` FAIL (post-F-012, in `scripts/lib/story.mjs` / `resolveStoryRefs`).
- `.github/workflows/ci.yml` — extend the existing "Codegen asset keys" step.

## Data flow / state

`MOB_TYPES` (TS) → gen-mob-types → `mob-types.json` → `check_content.mjs` →
FAIL on unknown mob refs in `content/maps/*` and `content/story/*`.

## Tests / acceptance criteria

See canonical spec §4: codegen unit test (direct `genMobTypes()` import), gate
fixtures (valid map green; typo'd mobType FAIL naming file/area/valid ids;
absent/malformed mob-types.json single FAIL with mob checks skipped; bogus story
refs FAIL) + fixture-hermeticity retrofit: every existing `runGate` helper passes
an explicit fixture `--mob-types` path.

**Sequencing:** implement only after F-012 ships to `release/1.4` (its story-graph
rewrite owns the code the story flip touches).
