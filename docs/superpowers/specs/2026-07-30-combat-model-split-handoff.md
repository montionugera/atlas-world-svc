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
| `docs/superpowers/specs/2026-07-30-combat-model-split-design.md` | `verify.mjs` staleness gate regenerates its tables; hand-edits are caught |
| `docs/superpowers/plans/2026-07-30-combat-model-split.md` | — (read it for phase structure) |
| `tools/combat-lab/index.html` — the live model math | 155 gates in `verify.mjs`, exit 0 |
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

The plan frames it as reconciling a formula. It is not. `derivedStats.ts` currently reads

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

A working draft that takes the multiplicative-gear route (with `WEAPON_REFERENCE = 10`
as neutral, offence magnitude from `str + int` together, direction from their split) is
preserved at:

```
/private/tmp/claude-502/.../scratchpad/derivedStats-P4-draft.ts
```

It is **unverified** — it was reverted rather than committed because all four
`derivedStats.test.ts` expectations and the C# twin were still out of sync, and a
half-landed pinned formula is worse than an untouched one.

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

## Two idea tickets to file

1. **Boss target rotation / aggro** — the focus-fire finding above. Blocks the boss
   `n²` branch meaning anything. Needs a design decision first.
2. **Pack no-focus-fire, properly tested** — a clustered-party engagement where target
   choice stays live while damage lands.

## Traps, each of which cost real time

- **`feat/F-018` was cut from `main`, which lacks the combat-lab work** — it lives only
  on `release/1.5`. Merge release into the feature branch before anything else.
- **`gen_combat_spec.mjs` embeds a live count of `gate(`+`check(` from `verify.mjs`
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
