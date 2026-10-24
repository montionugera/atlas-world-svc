---
title: "Skeleton extension contract: kaykit-core 23-joint reference + sec_/prop_ bone grammar"
id: F-153
status: refined
from_idea: I-232
---

# Skeleton extension contract: kaykit-core 23-joint reference + sec_/prop_ bone grammar

Phase P1 of the owner-approved modular-parts spec (v2.1, 2026-10-21). That spec lives in a private studio workspace and is not in git. This file is the self-contained P1 slice. The asset-studio epic covers P2–P3.

## Problem

- `atelier/asset-forge/validate.mjs:81-131,262-277` requires a character's joint set to **exactly equal** one reference: `kenney-mini` (7) or `kaykit-adventurer` (41).
- So no character can carry hair, cloth or prop bones. The studio's it11 knight (13/13 studio gates) FAILs `skeleton` only because of its 7 `sec_*` bones.
- 47 of the 49 shipped `game-client/assets/characters/*.glb` use an identical **23-joint** skeleton: `kaykit-adventurer` minus its 18 IK/control helpers. No reference matches it. The 6 in the manifest pass only because `seed` tier demotes the FAIL (`validate.mjs:176`).
- The Godot client never reads joint names, so there is no runtime blast radius.

## Why now

- The owner decided on **one standard skeleton for every new character**: KayKit with the 18 helpers removed. The helpers carry zero skin weight but ~28 KB of keyframes.
- Characters should gain hair/cloth/prop bones through a checkable grammar, not exceptions.
- The asset-studio pipeline work (P2–P3) is blocked on this contract.

## Sketch

- **New `rig-reference/kaykit-core.bones.json`.** It holds the 23 joints, a `parents` map (parent = nearest ancestor that is a skin joint, else `null`, so `root: null`), `allowExtras: true`, and the S3 allow-lists.
  - It goes in the **global** `rigReference` list.
  - `kaykit-adventurer` and `kenney-mini` stay as legacy exact-match references.
- `extract-bones.mjs` emits `parents`. `lib/gltf.mjs` reads node parent links.
- **Rules, checked only on an `allowExtras` reference:**
  - **S1:** core ⊆ joints, and every core parent matches. Rule id `skeleton-core`.
  - **S2:** each extra joint matches one of these. Rule id `skeleton-grammar`.
    - `^sec_(hair|hem|cloth|cape|sleeve|bag|beard|tail|ear|acc)_(l|r|c)(f|b)?([0-9])_([1-3])$`
    - `^prop_(weapon|shield|hat|back|fx)_(l|r|c)$`
  - **S3:** parents. Rule id `skeleton-topology`.
    - `_1` parents to {head, chest, spine, hips, upperleg.l/r}; `sleeve` may also use {upperarm, lowerarm}.l/r.
    - `_k` parents to `_(k-1)`.
    - `prop_*` parents to {hand, wrist, lowerarm, handslot}.l/r ∪ {head, chest, spine, hips, root}.
  - **S4:** sec + prop ≤ 30. Rule id `skeleton-cap`. On skinned primitives only: ≤ 4 influences, no unweighted vertex, |Σw−1| ≤ 1e-3.
  - **S5:** `lib/normalize-anim.mjs:31` also excludes `^(sec_|prop_)`.
- **Failure reporting:** when the joints contain the core of an `allowExtras` reference, report its rule ids. Otherwise report today's single `skeleton` FAIL naming the closest legacy reference.
- `intake.mjs` gains a `--kind` passthrough (today `character` is hard-coded at :103,120,162).

## Acceptance criteria

- [ ] The studio's renamed, helper-stripped it11 PASSes `validate.mjs --kind chibiPlayer --tier bespoke`, run on a /tmp copy.
- [ ] In a sandbox, `intake.mjs --kind chibiPlayer` lands the renamed it11.
- [ ] Negative fixtures FAIL with the expected rule id: missing core joint, re-parented core joint, bad prefix, disallowed parent, depth 4 (`skeleton-grammar`), orphan `_2`, > 30 extras.
- [ ] A fixture with a `root` whose parent is a non-joint node (`Rig`, `Rig_Medium`, …) PASSes.
- [ ] `npm test` in `atelier/asset-forge` is green.
- [ ] CI manifest validation (`ci.yml:298-299`) is green, which covers `player_knight.glb` and `mob_spear_thrower.glb` (41-joint legacy).

## Risks

- Reversible only until the first `sec_*` asset lands in the manifest. After that, reverting S2 turns CI red.
- No existing test asserts that extras FAIL (`validate.test.mjs:123,130,160,190`), so the new negatives are the only guard against over-loosening.
