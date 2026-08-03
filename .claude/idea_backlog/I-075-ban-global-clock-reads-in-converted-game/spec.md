---
title: "Ban global clock reads in converted gameplay directories (eslint) and update the CLAUDE.md timing invariant"
id: I-075
status: idea
---

# Lock in the injected clock

Step 4 of the migration begun in **F-028**. Depends on **I-074** (step 3) landing
first — there is no point banning a call that is still in use.

## Problem

Two things will otherwise erode the work done in F-028 and I-074:

1. **Nothing stops the next `Date.now()`.** The seam is a convention, and conventions
   decay. `BaseCombatSystem.ts:34` is the cautionary tale from this very codebase: a
   `protected now()` clock seam was written, then **never overridden**, and the same
   class went on to call `Date.now()` directly in five places. The seam existed and
   still lost.

2. **`CLAUDE.md` actively prescribes the wrong thing.** Its "Units & timing"
   invariant currently reads:

   > Use `performance.now()` for gameplay timing/cooldowns end-to-end; do not mix
   > with `Date.now()` for deltas.

   After F-028 that is misleading. `performance.now()` is also a global real-time
   clock and loses determinism identically — F-028's whole finding was that swapping
   `Date.now()` for `performance.now()` would **not** have fixed the measurement bug.
   An agent or contributor reading this line today is told to make the wrong change.
   The original I-069 spec was written from exactly this misreading.

## Why now

Cheap, and it is the difference between a migration that holds and one that has to be
re-litigated. I-069 was filed as "swap the clock" precisely because the documented
invariant pointed that way; leaving the line unchanged invites the same idea to be
filed again.

## Sketch

- **eslint `no-restricted-properties`** banning `Date.now` and `performance.now`
  under converted gameplay directories (`src/ai/`, `src/systems/`, `src/modules/`,
  `src/schemas/`, `src/rooms/systems/`), with the error message pointing at
  `SimClock`.
- **Allow-list the legitimate uses** rather than blanket-banning: event-id
  generation, log timestamps, dedup TTLs (`ProcessedEventTracker`) and performance
  instrumentation (`AIPerformanceMonitor`) are wall-clock by nature and are not
  simulation state. Prefer a narrow directory scope over scattered inline
  `eslint-disable` comments.
- **Rewrite the CLAUDE.md "Units & timing" bullet** to prescribe the injected
  `SimClock` for gameplay timing, and state plainly that both `Date.now()` and
  `performance.now()` are wrong in simulation paths, and why (determinism, not
  monotonicity).
- Add a short note to `docs/` explaining the pattern for new subsystems: take time as
  a parameter; never import a clock.

## Definition of done

- CI fails on a newly introduced `Date.now()` in a converted gameplay directory,
  demonstrated red-then-green.
- `CLAUDE.md` no longer prescribes `performance.now()` for gameplay timing.
