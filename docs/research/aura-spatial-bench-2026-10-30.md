# Aura Spatial Query Benchmark & Baseline Report (2026-10-30)

## Executive Summary

This report establishes the baseline performance and algorithmic complexity of the aura propagation path in `server-rs` as entity count scales ($N \in \{100, 400, 1600\}$).

The investigation confirms that the aura application path performs a **naive $O(N^2)$ scan** across all aura emitters and buff receivers, completely bypassing the spatial grid (`SpatialGrid`).

---

## Code Investigation & File:Line Evidence

### 1. The Real Aura Application Path

The aura propagation logic is implemented in [`server-rs/src/systems/combat.rs:430-467`](server-rs/src/systems/combat.rs#L430-L467) in `buff_and_aura_tick_system`:

```rust
// server-rs/src/systems/combat.rs:430-434
pub fn buff_and_aura_tick_system(
    clock: Res<SimClock>,
    mut receivers: Query<(Entity, &Position, &mut BuffContainer, Option<&PlayerAvatar>)>,
    mut auras: Query<(&Position, &mut AuraEmitter)>,
)
```

### 2. Evidence of Naive $O(N^2)$ Scan vs Spatial Index

1. **Absence of Spatial Index Resource**:
   [`SpatialGrid`](server-rs/src/spatial/grid.rs#L117-L230) provides $O(1)$ grid-cell localized queries (`for_each_player_in_radius`, `for_each_mob_in_radius`), but `buff_and_aura_tick_system` does not take `Res<SpatialGrid>` as a parameter at all ([`server-rs/src/systems/combat.rs:430-434`](server-rs/src/systems/combat.rs#L430-L434)).

2. **Full Nested Iteration**:
   In [`server-rs/src/systems/combat.rs:446-465`](server-rs/src/systems/combat.rs#L446-L465), every aura pulse executes a nested loop across all receivers:
   ```rust
   // Outer loop: iterates over every AuraEmitter
   for (aura_pos, mut emitter) in &mut auras {
       emitter.pulse_timer -= dt;
       if emitter.pulse_timer <= 0.0 {
           emitter.pulse_timer = emitter.pulse_interval_sec;

           let radius_sq = emitter.radius_m * emitter.radius_m;
           let buff_to_apply = emitter.aura_buff.clone();

           // Inner loop: iterates over EVERY receiver in the world
           for (_, receiver_pos, mut container, opt_avatar) in &mut receivers {
               if emitter.affects_allies && opt_avatar.is_none() {
                   continue;
               }
               let dx = receiver_pos.x - aura_pos.x;
               let dy = receiver_pos.y - aura_pos.y;
               if dx * dx + dy * dy <= radius_sq {
                   container.apply_buff(buff_to_apply.clone());
               }
           }
       }
   }
   ```
   When aura emitters scale with player count ($A = 0.1 \times N_{players}$) and receivers include players and mobs ($R = N$), the total distance calculations per tick is $A \times R \propto N^2$.

---

## Measured Baseline Benchmark Results

The benchmark was executed using `cargo test --manifest-path server-rs/Cargo.toml --test aura_spatial_bench_test --release -- --ignored --nocapture` over 200 simulation ticks per tier, with entities split 50/50 between players and mobs and auras assigned to 10% of players. Note that the timings reported here are single-run, and the $O(N^2)$ complexity claim rests on the code implementation rather than the empirical measurements alone:

| Entity Count (N) | Players | Mobs | Auras (10% players) | p50 (µs) | p95 (µs) | max (µs) |
|-----------------:|--------:|-----:|--------------------:|---------:|---------:|---------:|
|              100 |      50 |   50 |                   5 |     2.92 |     3.04 |   102.25 |
|              400 |     200 |  200 |                  20 |    11.42 |    11.54 |    13.79 |
|             1600 |     800 |  800 |                  80 |   129.46 |   488.71 |  3734.54 |

---

## Scaling Analysis

- **$N = 100 \to 400$ ($4\times$ scale)**:
  - Theoretical checks increase from $5 \times 100 = 500$ to $20 \times 400 = 8,000$ ($16\times$).
  - Measured p50 increases from 2.92 µs to 11.42 µs ($3.9\times$), with baseline ECS query overhead dominating at low $N$.
- **$N = 400 \to 1600$ ($4\times$ scale)**:
  - Theoretical checks increase from $8,000$ to $80 \times 1,600 = 128,000$ ($16\times$).
  - Measured p50 increases from 11.42 µs to 129.46 µs ($11.3\times$).
  - Measured p95 surges from 11.54 µs to 488.71 µs ($42.3\times$), with max spiking to 3.73 ms as cache thrashing and memory traffic compound the quadratic scan.

## Conclusion

The current aura propagation implementation in `buff_and_aura_tick_system` is **$O(N^2)$ unindexed**. Integrating `SpatialGrid` in a future task will allow aura emitters to query only relevant grid buckets ($O(K)$ per aura), eliminating the quadratic bottleneck. Per task instructions, no refactoring was performed in this task.
