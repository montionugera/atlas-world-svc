# Game server performance — research synthesis (2026-10-04)

Goal: improve the atlas-world game server's performance — backend (gameplay + physics, MMORPG scale)
and the simulator — judged on efficiency, scalability, simplicity.

Source: seven agy worker reports in this folder (01–07), cross-checked by the orchestrator against the
source and against a re-run of the repo's own load harness (`load-rerun.txt`).

## The one-paragraph answer

The server is limited by mob AI, not by physics and not by player count. Every mob scans every other
entity every AI pass (separation in `src/ai/AIModule.ts:132`, targeting in
`src/ai/AIWorldInterface.ts:139-167`), so cost grows with the square of the mob count. A spatial grid
that already exists for network visibility (`src/interest/SpatialHash.ts`) is not used by gameplay.
Pointing AI at that grid is the single highest-value change. Physics is a few percent of the tick and
should be tuned, not replaced.

## Measured capacity (repo load harness, re-run 2026-10-04, 50 ms budget, p95)

| players | 50 mobs | 200 mobs | 500 mobs | 1000 mobs |
|--:|--:|--:|--:|--:|
| 1   | 2.9 | 4.9  | 40.4 | 61.7 OVER |
| 50  | 2.0 | 5.8  | 20.2 | 84.6 OVER |
| 100 | 3.0 | 28.8 | 25.0 | 70.6 OVER |
| 200 | 6.3 | 13.1 | 34.1 | 87.2 OVER |
| 300 | 9.9 | 27.2 | 46.4 | 383.5 OVER |

Caveat: the machine was busy (load average ~26) during this run, so treat it as an upper bound.
It matches the 2026-08-02 recorded baseline (300 players x 200 mobs = 26.9 ms). 1000 mobs is over budget
even with one player — the mob-versus-mob cost alone fills the tick.

## Ranked recommendations

| # | Change | Why | Effort | Risk |
|--:|---|---|:-:|:-:|
| 1 | AI separation + targeting query the existing spatial grid | six AI functions = ~85% of CPU in the worker's profile | M | Low |
| 2 | Mobs with no player nearby go dormant; far mobs think at a lower rate | no dormancy exists today; every mob runs at full rate | M | Med |
| 3 | Battle queue: make it synchronous, drop the 100 ms batch delay, stop re-sorting on every insert | unawaited promise in the tick (`GameSimulationSystem.ts:156`) | S | Low |
| 4 | Remove the per-event `console.log` in `EventBus.ts:124`; call the never-called `cleanupAllEvents()` | log I/O in the hot path; slow memory leak | S | Low |
| 5 | Pose writes: skip sub-threshold changes; stop syncing dead fields (`angularVelocity`, `physicsBodyId`, `tags`, `angle` on living entities) | every entity dirties 6 fields every tick | S | Low |
| 6 | Drive the patch broadcast from the sim loop instead of a second timer; try 10 Hz patches | two independent 50 ms timers (`GameRoom.ts:161`, `:269`) | S | Low |
| 7 | Planck tuning: pass the configured iterations to `world.step` (`PlanckPhysicsManager.ts:377` ignores them), turn off continuous collision, do not apply force to idle bodies | config is silently ignored | S | Low |
| 8 | Take short-lived projectiles out of the physics world (overlap test on the grid) | body create/destroy churn | S-M | Med |
| 9 | Explicit `float32` / `uint16` schema types instead of generic `number` | smaller joins and deltas; needs C# client regen | M | Med |
| 10 | Simulator: route all sim time through `SimClock`, seeded RNG, counter-based ids, then run the harness unpaced as a CI gate | wall-clock reads force real-time pacing; ids collide | M | Med |

## Scalability path

1. Now: items 1–4, then raise `maxClients` (hardcoded to 1) and re-measure.
2. Next: one room per map zone with portal handoff through Nakama (the Albion model).
3. Later, only if design demands it: seamless hex sharding with ghost entities (already specced).

Do NOT build yet: a Rust/Go/WASM sim core, a replacement physics engine, worker threads inside a room,
dynamic cell splitting, time dilation, a full ECS rewrite.

## What not to trust in the worker reports

- Report 05's absolute tick times (e.g. 65 ms at 300 players x 200 mobs) were taken while seven workers
  benchmarked at once; the harness re-run gives 27 ms. The profile *shape* (AI dominates) agrees with the
  re-run and with two other lanes.
- Report 03's bandwidth figures (75–835 Mbps) multiply a full-view size by the tick rate; that number is
  the join payload, not the per-tick delta. Bandwidth per client is unmeasured.
- Report 02's "12–14x faster hand-rolled solver" is a synthetic benchmark of a solver that does not exist
  yet, and physics is only a few percent of the tick. Not worth it now.
- Microbenchmarks in reports 01, 02 and 04 re-implement our loops in standalone scripts; directionally
  useful, not measurements of the real code.
- Not independently checked: the EventBus log claim, the event-tracker leak, the lockfile version skew,
  and the external engine comparisons (several cite only a homepage URL).

Checked against source by the orchestrator: the all-agents separation loop, the full-scan targeting,
`world.step` without iterations, the two timers, and the AOI interval of 1.
