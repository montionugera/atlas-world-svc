# Implementation Plan: F-056 (E-001 Slice 2) Headless Rust ECS Simulation Core

**Worktree:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-056-2`  
**Branch:** `feat/F-056`  
**Goal:** Implement the authoritative headless Rust game server core (`server-rs`) powered by `bevy_ecs` and `rapier2d`, validating behavioral parity against `golden_sim_trace_1000.json` ($\epsilon \le 0.05$) and delivering $\le 1.0\text{ ms}$ tick latency at 10,000 entities ($< 2.5\text{ ms}$ at 20,000 entities).

---

## Task 1: Scaffold `server-rs` Crate with Bevy ECS & Rapier2D
- **Directory:** `server-rs/`
- **Action:**
  - Create `server-rs/Cargo.toml` with dependencies: `bevy_ecs = "0.15"`, `rapier2d = "0.22"`, `serde = { version = "1.0", features = ["derive"] }`, `serde_json = "1.0"`, `glam = "0.29"`, `rand = "0.8"`, `criterion = "0.5"`.
  - Implement modules:
    - `src/core/`: PRNG (`Mulberry32`), `SimClock` (fixed 50 ms tick step).
    - `src/ecs/`: Components (`Position`, `Velocity`, `Health`, `CombatStats`, `PlayerTag`, `MobTag`, `BotController`, `AiState`).
    - `src/spatial/`: Spatial hash grid with uniform cell indexing for $O(1)$ radius queries.
- **Verify:** `cargo check` compiles with 0 errors.

## Task 2: Implement Rapier2D Physics & Movement / AI Systems
- **Files:** `server-rs/src/physics/`, `server-rs/src/ai/`, `server-rs/src/combat/`, `server-rs/src/simulation.rs`
- **Action:**
  - Initialize Rapier2D simulation world with boundary colliders matching the arena ($1200 \times 1200$).
  - Implement Bevy ECS systems:
    1. `bot_steering_system`: replicates margin turn logic and deterministic Mulberry32 wander turn.
    2. `spatial_grid_rebuild_system`: populates spatial hash from positions.
    3. `separation_system`: applies separation deflection force ($4.0 \times \text{speed}$) using spatial grid neighbors.
    4. `physics_step_system`: syncs velocities and integrates positions with boundary clamping.
    5. `combat_system`: attack checks, cooldowns, damage application, and entity death.
- **Verify:** Headless simulation steps 1,000 ticks with zero panics or NaNs.

## Task 3: Golden Simulation Trace Parity Replay Harness
- **File:** `server-rs/tests/trace_replay.rs`
- **Action:**
  - Ingest `colyseus-server/src/tests/fixtures/golden_sim_trace_1000.json`.
  - Initialize `AtlasSimulation` with identical seed `0x1337C0DE`, 10 players, and 50 mobs.
  - Step 1,000 ticks, capturing snapshots at the exact golden snapshot ticks (0, 100, 200, ..., 1000 and 990–1000).
  - Assert coordinate, velocity, health, and liveness parity with tolerance $\epsilon \le 0.05$.
- **Verify:** `cargo test --test trace_replay` passes with 100% parity.

## Task 4: High-Density Entity Scale Benchmark (10,000–20,000 Entities)
- **File:** `server-rs/benches/sim_scale.rs`
- **Action:**
  - Implement Criterion benchmark with 1,000, 10,000, and 20,000 entities.
  - Profile tick latency p50, p95, p99 across spatial queries, AI separation, and physics steps.
- **Verify:** `cargo bench` demonstrates p95 $\le 1.0\text{ ms}$ at 10,000 entities and $< 2.5\text{ ms}$ at 20,000 entities.

## Task 5: Gate 1 Integration, Documentation & Quality Gates
- **Action:**
  - Ensure `scripts/precheck.sh` runs `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo test` in `server-rs`.
  - Update `README.md` with the Rust simulation core architecture, benchmarks, and cargo commands.
  - Run `./scripts/precheck.sh --no-install`.
- **Verify:** Gate 1 PASS.
