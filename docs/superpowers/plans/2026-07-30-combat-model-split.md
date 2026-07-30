---
title: "Plan — combat model physical/magical split (F-018)"
id: F-018
date: 2026-07-30
spec: docs/superpowers/specs/2026-07-30-combat-model-split-design.md
---

# Plan — F-018 combat model split

Spec: [`2026-07-30-combat-model-split-design.md`](../specs/2026-07-30-combat-model-split-design.md).
Read the spec first; this plan does not restate the formulas.

**Worktree:** `.claude/worktrees/F-018-phase-c-runtime-spine-player-race-class`,
branch `feat/F-018` (already merged `release/1.5` — the combat-lab work lives there,
not on `main`).

## Standing rules for every phase

Per the phased quality gate, a phase is **not done** until all five pass, in order:

1. **Implement** the change.
2. **Verify** — run it, paste the output. No "should work".
3. **Review** — independent adversarial review of *that phase's diff*. Self-review
   does not count.
4. **Refactor** — act on the review while the diff is small.
5. **Re-verify** — confirm the refactor did not break step 2.

Baseline to protect, re-run at every phase:

```bash
node scripts/gen_combat_model.mjs && node tools/combat-lab/verify.mjs   # expect exit 0
```

Other invariants that hold across all phases:

- **Never `git commit --amend`.** New commit on top, always.
- **Do not run prettier on `combat-model.json`** — generated, in `.prettierignore`.
- **Never hand-edit a generated table** in the spec. Edit the model, re-run
  `gen_combat_spec.mjs`.
- **A gate that has never failed is not known to work.** Every new gate gets
  deliberately broken once to prove it bites, and the break is reverted.
- **Pin new expectations in `verify.mjs`**, never read back out of
  `combat-model.json` — that is the tautology the old swings gate fell into.

---

## Phase 0 — Make the split actually execute (prerequisite)

Without this, `mDef` is dead code and the parity test in Phase 4 is meaningless. See
spec §10. This is [[I-027]].

**Task 0.1 — Write the failing test first.**
A magic-damage hit must be mitigated by `mDef`, not `pDef`. The test must **fail**
against current `main` — that failure is the evidence the bug is real.

**Task 0.2 — Plumb `damageType` through the attack payload.**
- Add `damageType` to `createAttackMessage`'s opts type (`BattleManager.ts:100-124`).
- Pass it from `ProjectileCollisionResolver.ts:57-70`.
- Confirm `BattleModule.ts:87` `payload.damageType || 'physical'` now receives the
  real channel rather than defaulting.

**Verify:** the Phase 0.1 test flips red → green; full server suite still passes
(`cd colyseus-server && npm test`).

**Risk:** this changes live damage numbers for magic attacks — that is the point, but
it is a real behavioural change, so the review must confirm no physical-damage path
shifted.

---

## Phase 1 — Extend the model to carry the split

Spec §3–§8. Everything happens in `tools/combat-lab/index.html` plus
`scripts/gen_combat_model.mjs`.

**Task 1.1 — Add the two globals** (`postureMix`, `elemWeight`) as inputs, documented
in the same wording as `durabilityHp`.

**Task 1.2 — Add the four per-entity tags** (`rho`, `theta`, `slant`, `element`) to the
player spec and every mob rank, all defaulting to the reduction point. `theta` and
`slant` are **signed** — see the spec's callout on the sign pathology.

**Task 1.3 — Shape coordinates and forward/inverse** exactly as spec §5. Leave the
"why arithmetic-on-attack, harmonic-on-defence" comment at both aggregates.

**Task 1.4 — Replace `hit()`** (`index.html:739`) per spec §6, element **outside** the
mix sum. Signature stays `(att, dfn, Ldef) -> number`.

**Task 1.5 — Add `matchup()` and `Q()`.** Do **not** multiply `Q` into `R` — once Task
1.4 makes `hit()` split-aware, `R_ref` already carries it and an explicit factor squares
it (invisibly, because `Q = 1` at the reduction point). `Q()` is for reporting and for
Phase 2's gates. Name it `matchup`, not `m`: `m` is the conventional local for a mob
throughout `index.html` and would shadow it.

**Task 1.6 — Leave `rankMults()` byte-identical.** Add the overdetermination-refusal
comment from spec §8. If this function changes at all, something has gone wrong.

**Verify — the reduction is the whole point:**
- R deviation over all 8 ranks at default tags must be **exactly 0**.
- Every pre-existing `EXPECT_*` unmoved, to the digit.

---

## Phase 2 — Gates

Spec §13. Add G1–G12, rewrite the mirror-match invariant and the orphaned `TERMS`
entries at `index.html:912-932` (they document a `pDef/(pDef+K)` form nothing
implements, and `verify.mjs:117-134` will force every new `<th>` to resolve).

**Verify:** all gates green. Then **prove at least three bite** by breaking them one at
a time and showing the failure output. Revert each break.

The three worth proving, because they are the ones a future refactor would silently
undo: **G2** (no free lunch), **G7** (element leverage full for every build — this is
the one that catches the magic-only regression), **G9** (G-ELEM content gate).

**G9 must recompute the band-worst sweep live**, exactly as `verify.mjs:575-592` does,
and must never transcribe spec §9's table. Prove it bites by authoring a
cycle-disadvantaged element onto **rank D** (which the original §9 list omitted).

Two gates this phase gained from the Phase 1 review, both of which would otherwise hide
behind `Q = 1`:

- **`R_shaped / R_flat === Q`** for an authored shape — this is what makes the
  Q-squaring bug fail loudly instead of silently.
- **Sweeping `postureMix` and `elemWeight` over their full ranges must leave every
  `EXPECT_LADDER` cell bit-identical at default tags** — the true, testable version of
  the outcome-neutrality claim that was originally overstated.

---

## Phase 3 — Regenerate the spec

`node scripts/gen_combat_spec.mjs`. Add `Q` as its own column everywhere R appears,
and "at `Q = 1`" to every headline claim (spec §7 callout — CS is no longer a
sufficient statistic).

Update the **foundation** spec's §8 open-questions list: items resolved by this work
come off it; the subtractive-vs-divisive divergence goes **on** it explicitly.

**Verify:** `verify.mjs` staleness gate passes; no table hand-edited; both specs
render.

---

## Phase 4 — `derivedStats` reconciliation

Spec §11. Three forced decisions, D6/D7/D8. This is the **pinned formula** — the
comment block in `contracts/src/meta/derivedStats.ts` says "do not improve the numbers
here". Update that comment to describe the new contract rather than leaving it
contradicting the code.

**Task 4.1 — D6, go multiplicative.** Drop the additive constants (`10`, `5`, `100`);
carry `grow(L)` as a single multiplicative factor. This is what restores level
cancellation.

**Task 4.2 — D7, both defences off `vit`.** `vit` = defensive magnitude; `str`/`int` =
offensive direction only. Removes the class bias where `int` bought `mAtk` **and**
`mDef` for free.

**Task 4.3 — D8, pin the R-visibility constraint.** `agi` stays R-invisible; add the
gate that **at most one** primary may be R-invisible, since two takes stat share to
20% and fails the ≥25% gate.

**Blast radius — this is the widest change in the plan.** `derivedStats` feeds the
Colyseus sim, Nakama display RPCs and the Flutter client. Every consumer must be
checked, and the three call sites that disagree with each other today
([[I-032]]: `Player.ts:97-98` vs `applyLoadout.ts:16-17`) will now disagree *louder*.
If Phase 4 cannot land cleanly without also fixing I-032, **stop and say so** rather
than half-fixing both.

**Verify:** `cd colyseus-server && npm test`; contracts build; a level-1 and a level-99
character produce the curve the model predicts.

---

## Phase 5 — The three tests

Spec §14.6.

**Task 5.1 — pack test.** `n` mobs + `n` players, run `T` ticks, assert no player takes
more than `(1+eps) * (1/n)` of total incoming damage. Mobs must not coordinate focus
fire — if they do, the `n²` terms cancel by symmetry and every party number in the
model is optimistic by up to 1.96×.

**Task 5.2 — boss test.** 1 boss + `n` players, same even-spread assertion.

**Task 5.3 — parity test.** Drive the real sim with `mob(L, rank)` from the model;
assert TTK within **±10%** and HP remaining within **±5pp**. This is the test that
closes the spec's largest stated gap — *no simulation has ever run*; every number in
the model is closed-form, with no crits, misses, kiting, movement or line of sight.

**Note on `maxClients`.** `GameRoom.maxClients` is currently `1` for single-player
debugging. Multi-player tests must construct the room directly rather than going
through client connection, following whichever existing test in
`colyseus-server/src/tests/` already does this.

**Expect the parity test to fail first.** It compares a closed-form model against a
real simulation for the first time. A failure here is a **finding**, not a blocked
task: record the discrepancy, decide whether the model or the sim is wrong, and do not
tune either one silently to make the test pass.

---

## Definition of done

All seven acceptance criteria in spec §14, plus:

- `bash .claude/ps-release-workflow/precheck.sh` (Gate 1) passes.
- Both specs regenerate clean; the `.html` renders stay untracked.
- The foundation spec's open-questions list reflects reality after this work.

## Explicitly not in this plan

Subtractive-vs-divisive mitigation, `aspd` channelisation, race/class fields
([[I-034]]), the `pAtk`/`mAtk` two-sources-of-truth bug ([[I-032]]) beyond what
Phase 4 forces, the clamp split-brain ([[I-033]]), and every unbuilt system the
foundation spec describes (mana, healers, potions, rest, aggro, gear tiers).
</content>
