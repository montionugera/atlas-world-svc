---
title: "Convert remaining gameplay subsystems to SimClock (respawn, projectile lifetimes, combat scheduling)"
id: I-074
status: idea
---

# Convert remaining gameplay subsystems to SimClock

Step 3 of the migration begun in **F-028**, which established the principle and the
mechanism: *gameplay simulation takes time as an input, never reads a global clock.*
F-028 shipped `SimClock` (`src/time/SimClock.ts`) and converted `AIModule`. This
converts the rest.

## Problem

F-028 proved the failure mode with a measurement, not an argument: driven by an
unpaced loop, `AIModule` ran its decision logic on **1 of 100 ticks**. Every system
still reading `Date.now()` has that same defect latent in it. It only shows up when
something drives the simulation at a non-production rate — a load harness, a replay
tool, a headless test, a fast-forward — and when it does, it produces plausible wrong
numbers rather than an error. That is exactly how F-027's first capacity table came to
be published and retracted.

## Why now

The load harness (`src/tests/load/roomLoad.harness.ts`) still paces itself to real
wall-clock time *solely* to compensate for these remaining systems. Finishing this
work is what lets the harness run unpaced — much faster measurement runs, and no
pacing-related validity caveat on the results. The Stage 3 `cellSize` decision from
I-058 depends on that kind of measurement.

## Sketch

### Order of conversion — easiest first, combat last

1. **Respawn timing** — `GameSimulationSystem.updateNPCs()`, `Mob.shouldRespawn()`,
   `WorldLife.diedAt`. Already internally self-consistent (`Date.now()` compared
   against a `Date.now()` timestamp), so conversion is mechanical.
2. **Projectile lifetimes** — `Projectile.createdAt` / `stuckAt` / `shouldDespawn()`.
   Same shape as respawn.
3. **Zone effects and status effects** — `ZoneEffectManager`, `StatusEffectManager`,
   `BattleStatus`.
4. **Combat cast/queue scheduling — last, and on its own.** See below.

### Combat scheduling needs its own budget

`BaseCombatSystem.ts:75-77` and `MobCombatSystem.ts:170-174` document a **deliberate
two-clock split**: cast/queue scheduling on `Date.now()` so `jest.setSystemTime` can
drive it deterministically, cooldown anti-spam on `performance.now()` for
monotonicity, and the two are never cross-subtracted.

That split is a symptom of reading a global — the only way to test a global clock is
to fake it. Injecting `SimClock` removes the need for the fake-timer apparatus
entirely, and the tests get *shorter*: `jest.useFakeTimers()` + `setSystemTime(...)`
becomes `clock.advance(50)`.

But the cost is real and must be budgeted honestly:

- **9 test files, 31 `setSystemTime` call sites** convert with it.
- `BaseCombatSystem.ts:34` already defines `protected now()` as a clock seam that
  **nothing overrides** and that the same class bypasses in five places. Completing
  that seam is the natural mechanism.
- The failure mode is **"attacks feel wrong"**, not a red test. This needs careful
  review and probably manual play-verification, unlike steps 1–3.

Do not fold combat into the same change as respawn/projectiles.

### Definition of done

- No `Date.now()` remaining in gameplay timing paths (event-id generation, log
  timestamps and dedup TTLs are fine — they are not simulation state).
- The load harness runs unpaced and reports the same AI-decision rate as paced.
- Each converted subsystem keeps its existing test coverage, with fake timers removed
  rather than retained alongside the clock.

## Prior art

- `.claude/refined_backlog/F-028-*/spec.md` — the principle, the measurement, and why
  a blanket `Date.now()` → `performance.now()` sweep is the wrong direction.
- F-028's test-doubles lesson: two fake rooms (`f018-harness.ts` `TestRoom`,
  `game-simulation-integration.test.ts` `buildRoom`) had to gain the `simClock` field.
  Any new room-scoped dependency has to be added to both, or the simulation loop's
  single `try/catch` swallows the resulting `TypeError` and ticks silently do nothing
  (see also I-070).
