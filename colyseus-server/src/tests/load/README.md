# Load harness

Answers spec risk R1 for I-058: the single-room capacity ceiling has never been
measured, and `cellSize` for Stage 3 cannot be chosen without it.

## Run

    npm run load

## Reading the output

One line per (players, mobs) point:

- `OK` / `OVER` — whether p95 tick duration fits the 50ms budget (`GAME_CONFIG.tickRate`).
- `bytes/client` — encoded size of one filtered view. This is the Stage 1 payoff metric.

## What to do with the result

Find the largest (players, mobs) point still marked `OK`. That is one shard's
capacity. `cellSize` for Stage 3 should be chosen so a cell's expected
population sits comfortably below it.

**If the largest point tested is still `OK`, extend the sweep upward before
concluding anything.** A ceiling that was never reached is not a measurement.

## Caveats

- Timing is machine-dependent. Never gate CI on these numbers.
- `ticks` per point is 100, not the original 300: the heaviest points
  (300 players / 1000 mobs) already run `OVER` budget and 300 ticks pushed a
  single point past the ~30s guideline. 100 ticks is still enough to get a
  stable p50/p95/p99.
- Mobs are placed uniformly at random; real maps cluster, so treat this as an
  optimistic bound.
- Direct `env.sim.update(ms)` is used, not `tickRoom()` — `tickRoom` calls
  `jest.advanceTimersByTime`, which does not exist under `ts-node`. This means
  timer-driven work (cooldowns scheduled via `setTimeout`) does not advance;
  these numbers measure per-tick simulation cost, not timer-driven behaviour.
- Mob spawns advance `state.tick` once per spawn to avoid a real id-collision
  bug in `MobLifeCycleManager.spawnMobAt` (2-char base36 suffix at a fixed
  tick collides at scale) — a workaround, not a fix.
