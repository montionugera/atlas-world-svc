# Load harness

Answers spec risk R1 for I-058: the single-room capacity ceiling has never been
measured, and `cellSize` for Stage 3 cannot be chosen without it.

## Run

    npm run load

## Reading the output

One line per (players, mobs) point:

- `OK` / `OVER` — whether p95 tick duration fits the 50ms budget (`GAME_CONFIG.tickRate`).
- `bytes/client` — average encoded size across up to 10 sampled clients' filtered
  views. This is the Stage 1 payoff metric.

## What to do with the result

Find the largest (players, mobs) point still marked `OK`. That is one shard's
capacity. `cellSize` for Stage 3 should be chosen so a cell's expected
population sits comfortably below it.

**If the largest point tested is still `OK`, extend the sweep upward before
concluding anything.** A ceiling that was never reached is not a measurement.

## Caveats

- Timing is machine-dependent. Never gate CI on these numbers.
- Direct `env.sim.update(ms)` is used, not `tickRoom()` — `tickRoom` calls
  `jest.advanceTimersByTime`, which does not exist under `ts-node`. This means
  timer-driven work (cooldowns scheduled via `setTimeout`) does not advance;
  these numbers measure per-tick simulation cost, not timer-driven behaviour.
- Mob spawns advance `state.tick` once per spawn to avoid a real id-collision
  bug in `MobLifeCycleManager.spawnMobAt` (2-char base36 suffix at a fixed
  tick collides at scale) — a workaround, not a fix.
- **The tick loop is paced to real wall-clock time** (~`GAME_CONFIG.tickRate`
  ms per iteration, sleeping only the leftover time after each tick's work).
  This is required, not cosmetic: `AIModule.update()` gates
  `updateAIDecision()` on `Date.now() - lastUpdateTime >= 50ms`
  (`src/ai/AIModule.ts:90-100`). An earlier, unpaced version of this harness
  measured only 6 of 100 ticks actually running AI decision logic — the
  numbers it produced were measuring a world running AI at ~6% of production
  frequency and are invalid. Pacing is deliberately generic (not an
  `AIModule` special case) because other `Date.now()`-gated systems may exist.
  Recorded durations cover only the simulation work, not the pacing sleep.
- 20 warm-up ticks are discarded before recording (JIT settling), and 200
  ticks are recorded per point (not 100) so p99 (`floor(0.99 * n)`) is not
  literally the sample maximum.
- Synthetic players are scripted bots that wander and reflect off world
  bounds (via `state.updatePlayerInput`, the same call a real client's move
  message triggers), not idle placements — idle bots would barely exercise
  per-player cost (pathing, deflection checks, AOI churn).
- **Not controlled — disclosed, not fixed:** the sweep runs every point
  sequentially in one process, always in the same ascending order, and
  process heap grows across the run (observed roughly 160MB → 350MB+ over the
  full sweep). Later points in a run carry more baseline GC pressure than
  earlier points at equal (players, mobs) load. There are also no repeated
  samples per point — each point is a single run, so isolated GC-blip tails
  (a p95/p99 spike with a normal p50) can appear and are not statistically
  distinguished from a real regression at that point.
