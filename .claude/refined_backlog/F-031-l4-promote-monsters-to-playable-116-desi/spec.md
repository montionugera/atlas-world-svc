---
title: "L4 promote monsters to playable: mint 3 Thornveil bases through the full chain, add a spawn drift gate and a bestiary-sheet join gate, and land the first two art:mob-* concept images"
id: F-031
from_idea: I-064
status: refined
design: docs/superpowers/specs/2026-08-05-l4-promote-monsters-design.md
plan: .claude/refined_backlog/F-031-l4-promote-monsters-to-playable-116-desi/plan.md
---

# F-031 — L4 promote monsters to playable

**The canonical design is `docs/superpowers/specs/2026-08-05-l4-promote-monsters-design.md`**
(approved 2026-08-05, adversarially reviewed and corrected in commit `e8867fe`). This file
is the backlog summary — the design doc is authoritative and travels with the branch.

## Goal

Prove the whole chain — **bestiary design → server mob type → character sheet → spawn
table → a mob you can actually fight** — on three Thornveil monsters, and leave behind the
rule plus the two gates that make the remaining ~20 bases cheap and un-driftable.

## Architecture

Power and character are separated onto two independent axes: the F-029 depth **tier** sets
the numbers (a single `tierFactor`), and the bestiary row's **enums** set the shape
(strategies, radius, defences, speed, element). No new fields on `MobTypeConfig` — F-030
already established that a species is simply its own `MOB_TYPES` entry. The authored and
runtime spawn tables stay separate (I-015 owns unifying them) but are bound by a codegen
artifact plus a drift gate so they cannot diverge further.

## Components

| component | one responsibility |
| --- | --- |
| `definitions/{brambleStalker,veilSpearling,brambleDrake}.ts` | one species' tuned config |
| `src/config/genSpawnAreas.ts` | pure builder: runtime spawn table → JSON |
| `scripts/codegen/gen-spawn-areas.{ts,sh}` | CLI driver writing the committed artifact |
| `checkSpawnPairing()` in `check_content.mjs` | G-SPAWN-PAIR |
| `checkBestiarySheets()` in `check_content.mjs` | G-BESTIARY-SHEET |
| `tools/art-forge/prompts/creature-identity.json` | per-creature prompt clause + silhouette |

## Scope

| tier | design | mobType | element | threat | art |
| --- | --- | --- | --- | --- | --- |
| route | `mob-bramble-stalker` | `bramble_stalker` | earth | melee | ✓ |
| route | `mob-veil-spearling` | `veil_spearling` | wind | ranged | ✓ |
| interior | `mob-bramble-drake` | `bramble_drake` | earth | melee | ✗ |

Plus **G-SPAWN-PAIR** (authored↔runtime areas paired by id; geometry free; eight
pre-content ids in a named `LEGACY_UNPAIRED` allowlist), **G-BESTIARY-SHEET** (a sheet whose
`id` is a bestiary design id mirrors that row's four enums, and the runtime
`MobTypeConfig.element` equals the row's element), and the first two `art:mob-*` images —
`bestiaryArt` 0 → 2 of 30, `mobBases` 7 → 10 of 30.

## Non-goals

`AreaAttackStrategy` (**I-043** — blocks 20 of 116 designs, 7 of Thornveil's 14) ·
server-side map loading (**I-015**, blocker documented) · non-humanoid silhouette anchors
(blocks 92 of 116 for art) · reconciling the eight `LEGACY_UNPAIRED` areas · the dead
`maxMobs` config · `mob:thorncrown_drake` having no `.glb` · 3D models for the new mobs.

## Tests / acceptance criteria

1. `npm test` and `npx tsc --noEmit` green in `colyseus-server`.
2. `node --test scripts/tests/` green, including a negative case per new gate.
3. `check_content.mjs --require-complete` passes.
4. Deleting either new gate rule turns the suite **red** — verified by actually deleting it,
   with the mob built through the real spawn wiring rather than hand-constructed.
5. All three mobs observed spawning **and attacking** in a running room.
6. Season-1 report shows `mobBases` 10; `bestiaryArt` 2 if the ComfyUI tunnel was reachable,
   otherwise 0 and stated plainly rather than papered over.

## Hard constraint

**Do not retarget the existing `thornveil_skirmishers` area.** `spear_thrower` is
`faction-thornveil`'s canonical mob in three story files (`factions.json:38`,
`style.md:144`, `bible.md:58`); stranding it would repeat exactly what F-030 did to
`double_attacker`. This lane adds new areas only.
