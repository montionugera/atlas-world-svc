---
title: "L4 promote monsters to playable: 116 designed but only 6 have server mob types and asset keys - define how many cluster-1 needs, mint the mobTypes through F-013 codegen, and wire assetKeys so character sheets stop hard-failing check_content.mjs:512"
id: I-064
status: idea
wave: 4
order: 3
sequence_why: "vertical slice: a few monsters made ACTUALLY playable - proves the chain"
design: docs/superpowers/specs/2026-08-05-l4-promote-monsters-design.md
---

# L4 promote monsters to playable

**Full approved design: `docs/superpowers/specs/2026-08-05-l4-promote-monsters-design.md`**
(2026-08-05). This file is the backlog summary; the design doc is authoritative.

## Problem

116 bestiary designs exist; **7** server mob types do. The gap is not one missing field —
it is three separate breaks:

1. **No spawn chain.** `content/maps/atlas-frontier.md` (3 areas, gated, never executed)
   and `colyseus-server/src/config/mapConfig.ts` (5 areas, executed, never gated) are
   unconnected — `grep -rn "content/maps" colyseus-server/src` returns zero hits. Authoring
   content does not make anything spawn. F-030 put its boss in the world by hand-editing
   `mapConfig.ts`.
2. **A third of the roster is unbuildable.** 20 of 116 designs are `threat: zone`, and
   `AttackCharacteristicType.AREA` has no implementation — `attackStrategyFactory.ts:102`
   logs "not yet implemented" and creates no strategy.
3. **No bestiary art at all.** `art:mob-*` count is 0; the `art-bestiary` budget line is
   0 of 30. The art pipeline is humanoid-anchored (img2img on per-job human silhouettes),
   so only 24 of 116 designs are generatable with the validated recipe.

The `spawn-entries` budget line has been sitting `blockedBy: "the variant axis does not
exist on MobTypeConfig"` — which F-030 has since resolved by precedent: a species is its
own `MOB_TYPES` entry, and `element?: Element` now exists on `MobTypeConfig`.

## Why now

Wave 4's other two lanes (F-029 ecology, F-030 boss) are shipped and promoted. F-029
produced `placement-thornveil.json` — 14 designs sorted into four depth tiers — and stated
that "the tier is the spawn-table axis" while explicitly minting nothing. This lane is
what mints it. Without it the wave ends with lore and one boss but no proven path from a
design to a mob a player can fight.

## Sketch

A **thin proof slice**, not a bulk mint: three bases completing a route→interior step in
Thornveil (`bramble_stalker`, `veil_spearling`, `bramble_drake`), each with a module,
codegen, a `status: concept` character sheet, and a spawn area mirrored into both maps.

The durable output is not the three monsters — it is:

- a **derivation rule** (tier → power, bestiary enums → character) that makes the next ~20
  bases mechanical, continuous with F-030's hand-tuned boss at `tierFactor 2.5`;
- **G-SPAWN-PAIR**, a drift gate binding authored spawn areas to runtime ones by id, with
  the seven pre-content areas named in an explicit allowlist rather than hidden;
- **G-BESTIARY-SHEET**, generalising F-030's single binding test so a sheet cannot drift
  from its bestiary row.

Plus the first two `art:mob-*` concept images (the two humanoid picks), taking
`bestiaryArt` 0 → 2 of 30.

Out of scope and already owned elsewhere: `AreaAttackStrategy` → **I-043**; server-side map
loading → **I-015**.
