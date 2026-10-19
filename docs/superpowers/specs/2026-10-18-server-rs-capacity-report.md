# server-rs Capacity Sweep Report (`E-004` Slice 1 / `F-081`)

- **Date:** 2026-10-18
- **Harness:** `server_rs::load_harness::run_capacity_sweep(&[50, 100, 200, 400], 100)` (`server-rs/src/load_harness.rs`, verified by `server-rs/tests/load_capacity.rs`)
- **Arena:** `4000 × 4000` units, `20 Hz` tick rate (`50 ms` tick budget)
- **Absorbs:** `I-072` (`snapshot_bytes_last` metric on `GET /metrics`) and `I-073` (automated capacity sweep test in CI)

## Measured Baseline (Pre-AOI Full-Room Broadcast)

| Entities | Players (20%) | Mobs (80%) | Tick p50 (ms) | Tick p95 (ms) | Tick max (ms) | Snapshot (B/player) | Bandwidth (KB/s/player @ 20Hz) | Total Outbound (KB/s) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 50 | 10 | 40 | 0.085 | 0.140 | 0.280 | 2,480 | 48.44 | 484.38 |
| 100 | 20 | 80 | 0.175 | 0.290 | 0.510 | 4,880 | 95.31 | 1,906.25 |
| 200 | 40 | 160 | 0.380 | 0.620 | 1.120 | 9,680 | 189.06 | 7,562.50 |
| 400 | 80 | 320 | 0.890 | 1.450 | 2.650 | 19,280 | 376.56 | 30,125.00 |

## Key Findings (Input to `E-004` Slice 2 World Model Decision)

1. **CPU Tick Budget (`50 ms` @ 20 Hz):**
   - Even at `400` entities (`80` players + `320` mobs), `server-rs` (Bevy ECS + Rapier2D + zero-allocation FlatBuffers) completes a full tick in **`p95 ≈ 1.45 ms`** (< 3% of the 50 ms tick budget).
2. **Bandwidth Bottleneck (`O(P × E)` without AOI):**
   - Without per-player Area-of-Interest (AOI) filtering, every player receives all `E` entities every 50 ms (`~48 bytes/entity`). At `400` entities (`80` players), total outbound bandwidth reaches **`~30.1 MB/s`**, whereas with an AOI radius of `600` units on a `4000 × 4000` region (`~7%` of region area), per-player snapshot size drops ~14× (`~1.4 KB/snapshot`, `~27 KB/s/player`).
