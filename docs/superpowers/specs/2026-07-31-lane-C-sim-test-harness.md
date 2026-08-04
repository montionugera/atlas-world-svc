---
title: "Lane C — pack/boss test harness, properly built (I-036)"
lane: C
release: "1.6"
date: 2026-07-31
ticket: I-036
status: "idea filed, spec written; starts after Lane B lands"
depends_on: "Lane B (I-037) — semantic, not file-level"
---

# Lane C — the sim tests that do not prove what they claim

Self-sufficient. You do not need the other lane docs.

Ticket: `.claude/idea_backlog/I-036-pack-no-focus-fire-properly-tested-a-par/spec.md`

<div class="callout warn">

**Start after Lane B (I-037) lands.** No file conflict — a semantic one: this lane's
assertions read the damage values Lane B is re-plumbing. Running both together means
rebasing onto a moving target.

</div>

## Two tests currently misrepresent themselves

Both landed in F-018 Phase 5 as **characterised divergences** — deliberately pinned as
`it.failing` so they turn red the moment someone fixes the underlying behaviour. They are
among the 6 pending tests in the colyseus suite. `npm test` exiting 0 must **not** be read
as these passing.

### 1. The pack test's even damage spread is an artifact of the setup

Measured during F-018: **only 1 of 49 swings (2%)** landed while a mob's own lane-mate was
not already its nearest player. The mobs never had the *opportunity* to converge, so the
even spread is explained by **lane geometry**, not by the AI declining to focus-fire. The
assertion pins that 2% as an **upper** bound, with the reasoning written into the test.

Consequence: both `2n/(n+1)` (pack) and `n²` (boss) are **unverified against the
simulation**. Every party-size number the balance model produces rests on them.

**The work:** a setup where a clustered party keeps taking damage while **every mob can
reach every player**, so convergence is possible and declining to converge becomes a real
observation.

**Acceptance signal:** the assertion **inverts to `>= 0.2` and passes.** If the mobs *do*
converge, that is a finding about the AI — not a threshold to loosen.

### 2. The parity test is a per-hit probe, not a fight

Every number it reports is reproducible in closed form without instantiating a room, so
it does **not** close the foundation spec's "no simulation has ever run" gap on its own —
the pack and boss tests are what actually drove rooms.

Worse, its two derived quantities are guarded only by a blanket `it.failing`, which passes
on **any** throw rather than only the intended divergence. An unrelated crash currently
reads as the expected result.

**The work:** drive a real fight with `mob(L, rank)` from the model, **to completion**,
measuring **TTK** and **HP remaining** against the model's prediction. Replace the blanket
guard with one that tolerates only the *named* divergence.

## The ceiling — state it up front so nobody chases it

<div class="callout danger">

`colyseus-server/src/modules/combat/DamageCalculator.ts` is **subtractive, 80%-capped and
1-floored**. The balance model is **divisive and uncapped**. They are different functions
and **cannot agree in general**.

A parity test can validate **shape and ordering only — never absolute damage.** Do not
tune either side to close the gap. If model and sim disagree, that is a finding to record;
reconciling the two mitigation forms is separate, unscoped work.

</div>

## Practical notes that will otherwise cost you an afternoon

- **`GameRoom.maxClients` is `1`** for single-player debugging — not the production cap.
  Multi-player tests must **construct the room directly** rather than going through client
  connection. Follow whichever existing test in `colyseus-server/src/tests/` already does
  this; do not invent a new harness.
- **Timing:** use `performance.now()` end-to-end for gameplay timing/cooldowns; never mix
  with `Date.now()` for deltas. Inject or mock timing to avoid flakiness.
- **The simulation loop is one ordered pass** in
  `src/rooms/systems/GameSimulationSystem.update(deltaTime)`: physics → projectiles →
  players → AI → mob lifecycle → mobs → NPCs → projectile cleanup → zone effects → battle
  message processing. Order matters when you reason about when damage actually lands.
- **Entity lifecycle via transition methods** — call `entity.die()`; never set
  `entity.isAlive = false` by hand.

## Relationship to the boss finding (I-035)

The boss half of the pack/boss pair is blocked on a **design decision**, not on test work:
bosses structurally cannot stop focus-firing (`nearest-opposite-team` + knockback forms a
closed loop). See the Lane D handoff. That decision **informs but does not block** this
lane — build the pack harness and the real-fight parity test regardless; the boss
assertion stays `it.failing` until aggro is decided and implemented.

## Files

- `colyseus-server/src/tests/f018-*.test.ts` — the existing pinned divergences
- likely a new shared room-construction helper under `colyseus-server/src/tests/`
- read-only reference: `tools/combat-lab/index.html` (`mob(L, rank)`, `rankMults()`)

## Done when

- The pack assertion **inverts to `>= 0.2` and passes**, or the convergence it exposes is
  filed as a defect with measurements.
- The parity test runs a fight to completion and asserts TTK + HP-remaining, with a guard
  that fails on unintended throws.
- Every remaining `it.failing` has a one-line comment saying what would make it flip.
- `./scripts/precheck.sh` exits 0.

## Shared invariants (repeated so this file stands alone)

1. **Cut your branch, then immediately `git merge release/1.6 --no-edit`.** The claim
   script cuts from `main`; this bit both F-018 and F-019 in 1.5.
2. **A green jest run does not prove the build compiles.** On 2026-07-30 jest reported
   571 passed / 0 failed and the next docker build failed with three errors in a file it
   had just "passed" — ts-jest caches per file. `cd contracts && pnpm build`, then
   `npx tsc --noEmit`.
3. **Run Gate 1 before shipping:** `./scripts/precheck.sh`.
4. **Do not tune numbers to make a test pass.** A model/sim disagreement is a finding.
5. **Do not run prettier on `tools/combat-lab/combat-model.json`** — generated, and in
   `.prettierignore`.
6. **Adding a gate turns the spec staleness gate red** until you re-run
   `node scripts/gen_combat_spec.mjs` — `gen_combat_spec.mjs` embeds a live count of
   `gate(`+`check(` from `verify.mjs`. That is not table drift; do not triage it as one.
   It cost a full blocker investigation once already.

Use **pnpm**, never npm. Never `git commit --amend`. Brainstorm to a solid spec under
`docs/superpowers/specs/` before `refine`.
