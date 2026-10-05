# Implementation Plan: F-056 (E-001 Slice 2) Headless Rust ECS Simulation Core

**Worktree:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-056-2`  
**Branch:** `feat/F-056`  
**Goal:** Implement the authoritative headless Rust game server core (`server-rs`) powered by `bevy_ecs` and `rapier2d`, validating behavioral parity against `golden_sim_trace_1000.json` ($\epsilon \le 0.05$) and delivering $\le 1.0\text{ ms}$ tick latency at 10,000 entities ($< 2.5\text{ ms}$ at 20,000 entities).

---

## Task 1: Scaffold `server-rs` Crate with Bevy ECS & Rapier2D
- **Directory:** `server-rs/`
- **Action:**
  - Created `server-rs/Cargo.toml` with `bevy_ecs 0.15`, `rapier2d 0.22`, `serde`, `serde_json`, `glam`, `rand`, `criterion`.
  - Implemented modular architecture: `core` (PRNG Mulberry32 & LCG, SimClock 50ms/20Hz), `ecs` (components & tags), `spatial` (dual-layer contiguous SpatialGrid).
- **Verify:** ✅ `cargo check` and `cargo test` pass with 0 errors.

## Task 2: Implement Rapier2D Physics & Movement / AI Systems
- **Files:** `server-rs/src/physics/`, `server-rs/src/ai/` (in systems), `server-rs/src/simulation.rs`
- **Action:**
  - Initialized Rapier2D simulation world with boundary colliders ($1200 \times 1200$).
  - Implemented Bevy ECS systems: `bot_steering`, `spatial_grid_rebuild`, `separation` ($4.0\times\text{speed}$ with Rayon task pools), `physics_step`, `combat`.
- **Verify:** ✅ Headless simulation steps 1,000 ticks with zero panics or NaNs (7/7 unit tests pass).

## Task 3: Golden Simulation Trace Parity Replay Harness
- **File:** `server-rs/tests/trace_replay.rs`
- **Action:**
  - Ingested `colyseus-server/src/tests/fixtures/golden_sim_trace_1000.json`.
  - Initialized `AtlasSimulation::init(0x1337c0de, 10, 50)`.
  - Replayed 1,000 ticks with snapshot assertions at ticks 0, 100, ..., 1000 and consecutive ticks 990–1000.
  - Verified 100% bit-parity at tick 0 across all 60 entities, tick 100 trajectory, and 1,000 ticks with $\epsilon \le 0.05$.
- **Verify:** ✅ `cargo test --test trace_replay` passes with 100% parity.

## Task 4: High-Density Entity Scale Benchmark (10,000–20,000 Entities)
- **File:** `server-rs/benches/sim_scale.rs`
- **Action:**
  - Authored Criterion scale benchmark measuring full simulation tick loop at 1k, 10k, and 20k entities.
  - Benchmark Results:
    - **1,000 entities:** $78.8\text{ }\mu\text{s}$ ($0.078\text{ ms}$)
    - **10,000 entities:** $503.8\text{ }\mu\text{s}$ ($0.503\text{ ms}$) — p95 $\le 1.0\text{ ms}$ budget met (50% faster)
    - **20,000 entities:** $1.03\text{ ms}$ — $< 2.5\text{ ms}$ budget met (58% faster)
- **Verify:** ✅ `cargo bench --bench sim_scale` verified with Criterion measurements.

## Task 5: Gate 1 Integration, Documentation & Quality Gates
- **Action:**
  - Updated `scripts/precheck.sh` ensuring `export PATH="$HOME/.cargo/bin:$PATH"` and running `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`.
  - Updated `README.md` with `server-rs` architecture and empirical scale benchmark evidence.
  - Verified `./scripts/precheck.sh --no-install`.
- **Verify:** ✅ Gate 1 PASS.
