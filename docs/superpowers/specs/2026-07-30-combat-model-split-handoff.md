---
title: "Handoff — F-018 combat model physical/magical split"
id: F-018
date: 2026-07-30
status: 5 of 6 phases shipped; Phase 4 not started
---

# Handoff — F-018

Lean by design. The artifacts below cannot go stale because gates enforce them —
read those first, and do not re-derive what they already say. This document covers
only what they *don't*: the one unstarted phase, the decision blocking it, and the
finding that changes what the whole feature is worth.

## What cannot go stale (trust these over any summary)

| artifact | enforced by |
| --- | --- |
| `docs/superpowers/specs/2026-07-30-combat-model-split-design.md` | `tools/combat-lab/verify.mjs` staleness gate regenerates its tables; hand-edits are caught |
| `docs/superpowers/plans/2026-07-30-combat-model-split.md` | — (read it for phase structure) |
| `tools/combat-lab/index.html` — the live model math | 155 gates in `tools/combat-lab/verify.mjs`, exit 0 |
| `tools/combat-lab/verify.mjs` — G1–G12 | three gates proven to bite by deliberate breakage |
| `colyseus-server/src/tests/f018-*.test.ts` | 564/570 green |

Shipped: `1e9329e` spec+plan · `ac7eff7` P0 · `a0cf4ae` P1 · `eff9985` P2+P3 · `25ce423` P5.

<div class="callout success">

**The reduction is exact.** At default tags and neutral element the split-aware model
is bit-identical to what it replaced — verified over 3,888 `R` cells against
`release/1.5`: **0 bit-mismatches, max relative deviation `0.00e+0`**. That is why the
solved ladder, `baseDef`, and all 35 pre-existing assertion sites needed no
recalibration, and why `rankMults()`'s executable body is byte-identical.

</div>

## Phase 4 is the only unstarted phase — and it is not mechanical

The plan frames it as reconciling a formula. It is not. `contracts/src/meta/derivedStats.ts` currently reads

```
maxHealth = 100 + 10*vit + 5*(level-1)     pAtk = 10 + 2*str + weapon.pAtk
```

D6 says go multiplicative, because those additive constants are level-independent and
therefore do **not** cancel in the attack/defence ratio — `R` drifts with level
regardless of what the split does. Fine so far.

<div class="callout warn">

**The blocker: weapons.** A flat `weapon.pAtk` addend is precisely the defect D6
removes, so weapons must contribute a *multiplicative gear scale*. That
**reinterprets every number in the item catalog** — `basic_sword pAtk 10` stops
meaning "10 damage" and starts meaning "a scale relative to a reference weapon."
The catalog file need not change, but its semantics do, and so does every balance
intuition attached to it. That is a content decision, not a refactor, and it is
**not settled anywhere in the spec.** D6 says "go multiplicative" and stops.

</div>

### The draft, inlined

A working draft was written and then **reverted**, not committed: all four
`contracts/src/meta/derivedStats.test.ts` expectations and the C# twin were still out of
sync, and a half-landed *pinned* formula is worse than an untouched one. It is
reproduced here rather than left in a scratchpad, because scratchpads are
session-scoped and a handoff that points at one is a dead link.

**It is unverified.** Nothing below has been run against the tests or the lab.

```ts
const GROWTH = 1.045;        // mirrors P.growth in the lab
const STAT_COEF = 0.5;       // mirrors P.statCoef
const STAT_REFERENCE = 99;   // points at which one primary saturates to 1
const BASE_HP = 100, BASE_ATK = 10, BASE_DEF = 5, MSPD_BASE = 20;
const WEAPON_REFERENCE = 10; // weapon pAtk+mAtk reading as gear scale 1

const g = Math.pow(GROWTH, level - 1);          // D6: ONE factor, so it cancels
const share = (p: number) => Math.max(0, p) / STAT_REFERENCE;

const offMagnitude = 1 + 2 * STAT_COEF * share(str + int);  // offence together
const defMagnitude = 1 + 2 * STAT_COEF * share(vit);        // D7: vit alone
const gear = 1 + (weaponPAtk + weaponMAtk) / (2 * WEAPON_REFERENCE);

// Direction: rho is the physical share of offence, from stats AND weapon.
// The two multipliers sum to exactly 2, so tilting costs the other channel
// one-for-one. Defaults to 0.5 so an unallocated character is symmetric
// rather than accidentally physical.
const rho = (str + int + weaponPAtk + weaponMAtk) > 0
  ? (str + weaponPAtk) / (str + int + weaponPAtk + weaponMAtk)
  : 0.5;

const atk = BASE_ATK * g * offMagnitude * gear;
const def = BASE_DEF * g * defMagnitude;

maxHealth    = BASE_HP * g * defMagnitude;
pAtk         = atk * (2 * rho);
mAtk         = atk * (2 * (1 - rho));
pDef = mDef  = def;                              // D7
maxMoveSpeed = MSPD_BASE * (1 + STAT_COEF * share(agi));  // no g — level-free
```

Three things to decide before adopting it, none of which the spec settles:

1. **`WEAPON_REFERENCE = 10` is invented.** It is the weapon power that reads as
   neutral. Pick it from the catalog's actual distribution, not from a round number.
2. **`STAT_REFERENCE = 99`** assumes allocation is measured against the level cap.
   Confirm against how points are actually granted.
3. **Both weapon channels feed magnitude** (`(pAtk + mAtk) / 2`), on the reasoning
   that a staff is as much a weapon as a sword and *which* channel it favours is
   direction. If that is wrong, gear scale and direction need separating.

### Phase 4's real blast radius (measured — the plan is wrong about this)

| plan says | measured |
| --- | --- |
| "feeds the Colyseus sim, Nakama display RPCs and the Flutter client" | `nakama/src` has **zero** references; **no Dart consumer exists** |
| — | production reach is **one file**: `colyseus-server/src/meta/applyLoadout.ts` |
| — | **a third hand-written copy exists**: `game-client/src/UI/MetaIds.cs` → `MetaFormulas.Derived`. Its comment cites a `nakama/src/...` path that does not exist. No codegen between them — D6 must land in C# too or the Loadout screen shows stats the server ignores |
| "stop if Phase 4 needs I-032 fixed" | **not needed.** `recalculateStats()` is reachable only from `equipWeapon()`, so the clobber fires on weapon switch, not on join |

## The finding that matters more than the feature

<div class="callout danger">

**The model's party assumptions do not hold in the real simulation.** This is Phase 5's
actual output, and it is worth more than a green test would have been.

**Bosses focus-fire and structurally cannot stop.** `nearest-opposite-team` picks a
victim → knockback pushes that victim away → the boss then *chases* the victim it just
hit → which keeps that victim nearest. The loop never hands the target to anyone else.
The boss branch prices a rank as though damage split `n` ways, so at S/SS/SSS one
player absorbs **8× / 20× / 50×** the intended pressure and dies in `swings` swings
while the rest of the party is untouched.

**No arithmetic in the lab fixes this.** It needs an aggro/threat system or
multi-target boss attacks — an unmade design decision, explicitly outside the
foundation slice.

</div>

And the pack test does not rescue it. The measurement that decides whether that test
proves anything: **only 1 of 49 swings (2%)** landed while a mob's own lane-mate was
not already its nearest player. So the even spread is explained by the **lane
geometry**, not by the AI declining to converge.

That 2% is pinned as an **upper** bound, deliberately, with the reasoning in the test.
It is not the `>= 0.2` the assertion wants to be. Raising it is the work: a setup where
a clustered party keeps taking damage while every mob can reach every player.
**Inverting that assertion is the signal the work landed.** Until then treat both
`2n/(n+1)` and `n²` as **unverified against the sim**.

> **Acceptance criterion 6 ("three tests pass: pack, boss, parity") is NOT met.**
> `npm test` exits 0, and that must not be read as meeting it — the divergences are
> `it.failing`, so they turn red the moment someone fixes them.

### What the parity test does and does not do

It is a **per-hit damage probe, not a simulated fight** — every number it reports is
reproducible in closed form without instantiating a room. So it does *not* close the
foundation spec's "no simulation has ever run" gap on its own; the pack and boss tests
are what actually drove rooms. A real parity test needs a fight run to completion with
TTK and HP-remaining measured against `mob(L, rank)`. Its two derived quantities are
currently guarded only by an `it.failing`, which passes on **any** throw rather than
only on the intended divergence.

Also unreconciled, and load-bearing: `colyseus-server/src/modules/combat/DamageCalculator.ts` is **subtractive,
80%-capped, 1-floored** while the model is **divisive and uncapped**. Different
functions; they cannot agree in general. **This model does not predict shipped damage
numbers.**

## Every remaining step, in order

| # | step | blocked on |
| --- | --- | --- |
| 1 | **Decide weapon semantics** — flat `pAtk` addend → multiplicative gear scale, reinterpreting every item-catalog number | a content decision; nothing else |
| 2 | **P4 `derivedStats`** D6/D7/D8. Land in **all three** copies: `contracts/src/meta/derivedStats.ts`, `game-client/src/UI/MetaIds.cs` (`MetaFormulas.Derived`), and reconcile the divergent `Player.recalculateStats`. Update the 4 expectations in `contracts/src/meta/derivedStats.test.ts` | step 1 |
| 3 | **File the three idea tickets** below | — |
| 4 | **Gate 1** — `bash .claude/ps-release-workflow/precheck.sh` | — |
| 5 | **Ship F-018 into `release/1.5`**, then worktree cleanup | Gate 1 green |

Steps 3–5 do **not** depend on 1–2. F-018 is shippable as-is if you want the split, the
gates and the findings landed while the weapon decision waits — P4 is additive to it.

## Three idea tickets to file

None are filed yet; filing needs a commit on the `_release` worktree.

1. **Boss target rotation / aggro** — the focus-fire finding above. Blocks the boss
   `n²` branch meaning anything. Needs a design decision first.
2. **Pack no-focus-fire, properly tested** — a clustered-party engagement where target
   choice stays live while damage lands, plus a parity test that runs a fight to
   completion rather than probing single hits.
3. **`BATTLE_ATTACK` carries no `damageType`.** Correct today — both mob and NPC
   emitters source `damage` from `pAtk` — and documented as deliberate at
   `colyseus-server/src/modules/BattleManager.ts:50`, but it is **the one remaining place a magical hit could
   silently become physical** if a future emitter sources `mAtk` into that event. The
   `?? 'physical'` default will not catch it.

Already filed: **I-034** (race/class + per-race leans, deferred from this slice).
Closed by this work: **I-027** (`damageType` dropped on the queue).
Still open and untouched: **I-032** (two sources of truth for `pAtk`/`mAtk`),
**I-033** (primary-stat clamp split-brain).

## Traps, each of which cost real time

- **`feat/F-018` was cut from `main`, which lacks the combat-lab work** — it lives only
  on `release/1.5`. Merge release into the feature branch before anything else.
- **`scripts/gen_combat_spec.mjs` embeds a live count of `gate(`+`check(` from `tools/combat-lab/verify.mjs`
  into the spec.** Adding gates turns the staleness gate **red** until you re-run it.
  That is not table drift. Do not go hunting for it — this cost a full blocker triage.
- **`Q` must never be multiplied into `R`.** Once `hit()` is split-aware, `R_ref`
  already carries it; an explicit factor squares it, and the error is **invisible at
  the reduction point** because `Q = 1` there. `R = R_ref × Q` is an identity, not a
  step. The spec and plan both said otherwise and are corrected.
- **Rank B breaks at `Q < 0.957`, not `0.609`.** `0.609` is `R` at the rank's own level
  with `n = 1`; the gate-5e **band-worst** is what matters and is 1.5–2.4× lower:
  `E 6.650  D 3.157  C 1.909  B 1.045  A 0.859  S 1.165  SS 1.152  SSS 1.328`. At
  `Q = 0.25` **every rank except E** is a loss — D and A included, both missing from
  the original list. **G9 recomputes this sweep live and must never transcribe it.**
- **Holy↔Void is *mutual* 2.0, so `Q = 1`** — the *safe* pair, a pure pacing lever.
  Only the one-directional cycle `water > fire > earth > wind > water` moves `R`. `Q`
  over the shipped table is **trinary: `{0.25, 1.0, 4.0}`**, 84% of pairs being 1.0.
- **`.claude/refined_backlog/*/plan.md` is gitignored** — canonical specs and plans
  must live under `docs/superpowers/`. The backlog stub is a pointer only.
- Use **pnpm**, not npm, for installs. A fresh worktree needs
  `cd contracts && pnpm build` or 5 suites fail on
  `TS2307: Cannot find module '@atlas/contracts'`.
- **Never `git commit --amend`** in this repo. New commit on top, always.
- Do not run prettier on `tools/combat-lab/combat-model.json` — it is generated and in
  `.prettierignore`.

## Definition of done, as it now stands

- [x] P0 `damageType` plumbing — `mDef` reachable in a live room
- [x] P1 split-aware model, exact reduction
- [x] P2 G1–G12, three proven to bite
- [x] P3 spec regenerated
- [ ] **P4 `derivedStats`** — blocked on the weapon-semantics decision above
- [x] P5 sim tests — landed as *characterised divergences*, not passes
- [ ] Gate 1 (`bash .claude/ps-release-workflow/precheck.sh`)
- [ ] Ship into `release/1.5`
