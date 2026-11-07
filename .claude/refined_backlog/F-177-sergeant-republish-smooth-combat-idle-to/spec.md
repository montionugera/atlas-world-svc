---
title: "Sergeant republish: smooth combat_idle to attack seam"
id: F-177
from_idea: I-258
status: refined
---

# I-258 Sergeant republish: smooth combat_idle to attack seam

## Goal
Owner 2026-11-07 ("Smooth + gate it"): the watch sergeant snapped 48.0 deg (attack) and 41.5 deg (attack_2) from combat_idle into the first attack frame. The private character pipeline now eases the first 8 frames of attack/attack_2 from the ready pose (seam 0.56 / 0.58 deg, strike peak speed unchanged) and gates the seam at 10 deg. The new build is published to Asset Studio; Atlas must pull it.

New asset: model 01a1b4af-c079-7332-a54e-1455ee52e2aa, tag p6s-11071330, sha256 bec60a2994f76864c029a127334bfba61f47711f2038d563218d8d51a4a7eb96, 2,753,804 B. Old: 01a1b35e-11e3-7243-8e4b-b39f87fb9a95 / p6c-11070720 / 42a07e62….

## Change
Point every reference at the new asset: `game-client/assets/manifest.json` (scene, source, pull), `atelier/asset-forge/tests/validate.test.mjs` SERGEANT sha, `art-source/LICENSES.md` row, `content/studio/game-systems.json` strip src (re-render the strip for the new sha). Bytes stay pull-only (repo is public).

## Acceptance criteria
- [ ] No tracked file outside the backlog names 42a07e62… or 01a1b35e… .
- [ ] `node scripts/studio-pull.mjs` fetches the new glb and its sha256 matches.
- [ ] Godot PipelineCharVerify passes on the new glb (all clips incl. combat_idle, attack, attack_2).
- [ ] Gate 1 passes.
- [ ] Edit host wiki strip image for the new sha returns 200 image/png.
