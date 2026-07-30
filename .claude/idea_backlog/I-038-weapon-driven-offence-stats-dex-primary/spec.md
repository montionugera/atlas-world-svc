---
title: "Weapon-driven offence stats: dex primary + multiplicative derivedStats (F-018 Phase 4)"
id: I-038
status: spec-approved
plan: docs/superpowers/plans/2026-07-30-combat-model-split-completion.md
source: "F-018 Phase 4, deferred at ship time; design decided by the owner 2026-07-30"
---

# Weapon-driven offence stats: dex primary + multiplicative derivedStats

> **The design is settled and the plan is written.** Canonical plan:
> `docs/superpowers/plans/2026-07-30-combat-model-split-completion.md` — **Part 2,
> Phases C–F**, which carries the formula, the solved constants, every file to touch and
> every test to write. This file is the backlog stub; do not re-derive from it.

## Problem

`contracts/src/meta/derivedStats.ts` is additive and its constants are level-independent:

```
maxHealth = 100 + 10*vit + 5*(level-1)     pAtk = 10 + 2*str + weapon.pAtk
```

Because `100`, `10`, `5` and the flat `weapon.pAtk` addend do not scale with level, they
**do not cancel in the attack/defence ratio** — difficulty `R` drifts with level no
matter what the balance model says. F-018 shipped the split-aware model on top of this,
so the model and the shipped formula disagree about how level works. D6/D7/D8 in
`docs/superpowers/specs/2026-07-30-combat-model-split-design.md` §11 name the fix; F-018
deliberately shipped without it because going multiplicative reinterprets every number in
the item catalog, which is a content decision rather than a refactor.

Three further defects the same change closes:

- **`int` buys `mDef` for free** (`mDef = 5 + int`), so a caster is incidentally tanky
  against magic. D7 puts both defences on `vit` alone.
- **`dex` does not exist in `contracts` at all.** `PrimaryStats` is `str/agi/int/vit`;
  colyseus's `BaseStat` is `agi/str/vit/dex` with no `int`. Server-side `dex` is dead
  weight — five grep hits, none in combat code — and `applyLoadout.ts` carries a comment
  conceding it.
- **Three hand-written copies of the formula disagree.** `derivedStats.ts`,
  `Player.recalculateStats()` (which ignores level and allocation entirely), and the C#
  twin `MetaFormulas.Derived` in `game-client/src/UI/MetaIds.cs`, whose doc comment cites
  a `nakama/src/...` path that does not exist. No codegen connects them.

## Why now

F-018 is shipped, so this is the only remaining item from its Definition of Done. The
owner settled the blocking content decision on 2026-07-30, which is what unblocks it.
Doing it now also means the balance model and the shipped formula stop disagreeing while
the model's reasoning is still fresh and gated.

## Sketch

Owner-decided, **do not re-litigate**:

- **Offence reads exactly ONE primary stat, chosen by the equipped weapon** (RO
  convention): bow → `dex`, casting → `int`, sword/dagger/scythe → `str`.
- **Gear scale** `= (weapon.pAtk + weapon.mAtk) / 18`, so best-in-catalog (`scythe`)
  reads **1.0** — matching the lab's `gearTiers` convention (`E 0.7 / C 0.85 / A 1.0`,
  scale ≤ 1).
- Magnitude from the weapon's **total** power, direction from its **channel ratio**, stat
  from a new catalog field. Every existing catalog number keeps exactly one job.
- Because offence reads one stat, the share denominator is unambiguously `99` and
  saturates at `1.0`, matching the lab's `alloc ≤ 1`.
- **Constants solved from an anchor, not chosen:** level 1, all primaries 1,
  `basic_sword` must reproduce today's `maxHealth 110 / pAtk 22 / pDef 6`. Verified
  numerically before the plan was written.
- `maxMoveSpeed` stays additive — it is on neither side of the attack/defence ratio.
- **Intended behaviour change:** a blade yields `mAtk` of exactly `0`.

Carries a **profile schema v2 migration** (adding `dex`), and
`nakama/src/storage.ts:47-56` will reset `level`/`xp`/`statPoints` on every existing doc
if the v1→v2 case is omitted — the plan makes that a gated, test-proven step.

## Related

- Blocked-on-nothing follow-up to **F-018** (shipped `release/1.5`, merge `3059204`).
- Narrows **[[I-032]]** (two `pAtk`/`mAtk` sources of truth) — gates the divergence and
  fixes the weapon-switch clobber without merging the catalogs.
- Touches but does not close **[[I-033]]** (primary-stat clamp split-brain).
- Sharpens **[[I-037]]** — under this formula a blade's `mAtk` is `0`, so an emitter
  reading `mAtk` deals zero damage rather than wrong-channel damage.
