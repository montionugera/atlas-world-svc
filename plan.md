# Implementation Plan: F-062 (E-002 Slice 3) Bestiary Catalog Ingestion, Mob AI States, Threat Table & Respawn Lifecycle in server-rs

**Worktree:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-062-bestiary-catalog-ingestion-mob-ai-states`  
**Branch:** `feat/F-062`  
**Epic:** `E-002` (Complete game logic parity and full colyseus-server decommissioning)  
**Goal:** Ingest the full bestiary catalog from `content/bestiary/bestiary.json` into `server-rs`, implement mob stat derivation matching F-031 rules, decaying threat tables with taunt support, Bevy ECS mob AI state machine (Idle, Wander, Chase, Attack, ReturnHome), and the respawn lifecycle, verified by automated unit and integration tests.

---

## Task 1: Bestiary Catalog Ingestion & Stat Derivation Engine
- **Location:** `server-rs/src/content/bestiary.rs` and `server-rs/src/content/mod.rs`
- **Specification:**
  - `BestiaryEntry`: `id: String`, `name: String`, `family: String`, `body_plan: String`, `level_band: String`, `element: Element`, `archetype: String`, `threat: String`, `durability: String`, `speed: String`, `region: String`, `faction: String`, `lore: String`, `visual_brief: String`.
  - `BestiaryCatalog`: parse `content/bestiary/bestiary.json` (via compile-time `include_str!` or runtime read), indexing all 30+ mob types.
  - `DerivedMobStats`: `hp: f32`, `p_atk: f32`, `p_def: f32`, `m_def: f32`, `armor: f32`, `move_speed: f32`, `radius: f32`, `chase_range: f32`, `element: Element`, `attack_range: f32`, `is_ranged: bool`.
  - Derivation rules matching `f031-mob-derivation.test.ts`:
    - `TIER`: verge (0.75), route (1.0), interior (1.75), heart (2.5)
    - `DURABILITY`: low (70), mid (100), high (150) -> `hp = round(durability * tier)`
    - `SPEED`: low (5.0), mid (8.0), high (11.0)
    - `ARCHETYPE`:
      - `skirmisher`: radius 3.0, pDef 1.0, armor 1.0, chaseRange 20.0
      - `bruiser`: radius 5.0, pDef 3.0, armor 2.0, chaseRange 25.0
      - `tank`: radius 5.0, pDef 4.0, armor 3.0, chaseRange 15.0
    - `threat`: `ranged` has ranged attacks, others melee only.
  - Unit tests verifying catalog parsing and exact stat derivation.

---

## Task 2: Decaying Threat Table & Threat ECS Component
- **Location:** `server-rs/src/ai/threat.rs` and `server-rs/src/ai/mod.rs`
- **Specification:**
  - `ThreatTable`:
    - `entries: HashMap<Entity, ThreatEntry { value: f32, stamp: f32 }>`
    - `taunted_entity: Option<Entity>`, `taunted_until: f32`
    - `half_life: f32` (default 6.0s)
    - `add_threat(entity, amount, current_time)`
    - `taunt(entity, duration, current_time)`
    - `top_target(current_time) -> Option<Entity>`
    - `decayed_value(entry, current_time) -> f32`
  - Unit tests verifying lazy exponential decay, taunt pinning, and threat accumulation.

---

## Task 3: Mob AI State Machine & Steering
- **Location:** `server-rs/src/systems/mob_ai.rs` and `server-rs/src/ecs/components.rs`
- **Specification:**
  - Component `MobAi`: `state: AiState` (Idle, Wander, Chase, Attack, ReturnHome), `home_pos: Position`, `leash_distance: f32`, `chase_range: f32`, `attack_range: f32`.
  - Component `MobSpawnAnchor`: `spawn_pos: Position`, `mob_id: String`, `tier: String`, `respawn_delay_sec: f32`.
  - System `mob_ai_system`:
    - Evaluates threat table:
      - If threat target exists within leash distance: steer toward target; if within attack range, execute attack (melee hit or ranged projectile).
      - If target leaves leash distance or dies: clear threat and transition to `ReturnHome`.
      - If no threat: wander near home position or idle.

---

## Task 4: Mob Respawn Lifecycle
- **Location:** `server-rs/src/systems/mob_lifecycle.rs` and `server-rs/src/simulation.rs`
- **Specification:**
  - Component `DeadMobTracker`: `death_time: f32`, `respawn_at: f32`, `anchor: MobSpawnAnchor`.
  - System `mob_lifecycle_system`:
    - Detects mob death (`health.is_alive == false`).
    - Spawns `DeadMobTracker` and despawns or hides dead mob entity.
    - When `current_time >= respawn_at`: spawns fresh mob entity at `anchor.spawn_pos` with full health, derived stats, and clean threat table.
  - Wire systems into `AtlasSimulation::step()`.

---

## Task 5: Integration Tests & Parity Verification
- **Location:** `server-rs/tests/bestiary_and_mob_ai.rs`
- **Specification:**
  - Test 1: Ingestion of full `bestiary.json` catalog (verifying 30+ mob entries).
  - Test 2: Parity tests for `mob-bramble-stalker`, `mob-veil-spearling`, and `mob-bramble-drake`.
  - Test 3: Player damages mob -> threat table records threat -> mob enters Chase/Attack state.
  - Test 4: Mob death -> respawn timer ticks -> mob respawns at anchor with full health.

---

## Task 6: Documentation, Precheck & Ship
- Update `server-rs/README.md`.
- Verify `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo test`.
- Run `./scripts/precheck.sh --no-install`.
- Commit changes to `feat/F-062`.
- Ship to `release/1.11` via `psrw ship --no-deploy`.
