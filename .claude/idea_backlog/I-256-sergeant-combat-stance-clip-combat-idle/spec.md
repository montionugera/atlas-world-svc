---
title: "Sergeant combat stance clip: combat_idle shows the body"
id: I-256
status: idea
---

# Sergeant combat stance clip: combat_idle shows the body

## Problem

F-174 maps the pipeline sergeant's `combat_idle` state to the `block_idle` clip
(`game-client/assets/manifest.json`, entry `npc:lantern_hollow_watch_sergeant`). In
`block_idle` the shield is raised in front of the face and torso, so in combat stance
the player sees a shield, not the sergeant. The p4b build had no stance clip at all.

## Why now

Owner choice 2026-11-07 ("Add a real stance clip"): get a proper stance clip from
Mixamo, rebuild the sergeant, and remap `combat_idle` to it.

## Sketch

Already done outside this repo (asset-studio-private pipeline, no repo bytes):
Mixamo "Sword And Shield Idle" (c9cc6f74) exported for the sergeant, added as
`combat_idle` to the sergeant clip set, rebuilt with `atlas-char build` (gates PASS,
anomaly items unchanged and owner-accepted), published to Asset Studio as tag
`p6c-11070720`, asset `01a1b35e-11e3-7243-8e4b-b39f87fb9a95`, sha256
`42a07e62e7321e9781d3e1b2619c60a0af47c8382c940ad756cdbdfe62788da2`.

Repo change: the manifest pull record points at the new build, and
`anims.combat_idle` = `combat_idle`. Bytes stay pull-only (owner R0 2026-11-06).

## Acceptance criteria

- [ ] `game-client/assets/manifest.json` sergeant `pull` = asset `01a1b35e-11e3-7243-8e4b-b39f87fb9a95`, tag `p6c-11070720`, sha256 `42a07e62…8da2`; `anims.combat_idle` = `combat_idle`.
- [ ] `node scripts/studio-pull.mjs` pulls the new build and its sha256 matches.
- [ ] The pulled glb contains an animation named `combat_idle` (and every other clip the manifest maps).
- [ ] No glb/studio-cache bytes are tracked (`checkNoTrackedCache` passes); Gate 1 (`./scripts/precheck.sh`) passes, including the `pipeline char` Godot section.
- [ ] Review link (tested, opens on the clip): Asset Studio `...&asset=01a1b35e-11e3-7243-8e4b-b39f87fb9a95&clip=combat_idle`.
