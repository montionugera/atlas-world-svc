# Implementation Plan: F-063 (E-002 Slice 4) Nakama Persistent Storage Integration in server-rs

**Worktree:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-063-nakama-persistent-storage-integration-fo`  
**Branch:** `feat/F-063`  
**Epic:** `E-002` (Complete game logic parity and full colyseus-server decommissioning)  
**Goal:** Implement the Nakama persistent storage and RPC client in `server-rs`, player stat derivation matching `contracts/src/meta/derivedStats.ts`, avatar initialization with persistent loadouts on WebSocket connect, and match event reporting, verified by automated integration tests.

---

## Task 1: Nakama REST & RPC Client
- **Location:** `server-rs/src/storage/nakama.rs`, `server-rs/src/storage/mod.rs`
- **Dependencies:** Add `reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }` to `server-rs/Cargo.toml`.
- **Specification:**
  - Define `LoadoutSnapshot`, `ProfileDoc`, `PrimaryStats`, `EquippedItemIds`, `MatchEventBatch`, `MatchEvent`.
  - Implement `NakamaClient`:
    - `new(base_url: String, http_key: String, timeout_ms: u64, retries: u32) -> Self`
    - `verify_session(&self, token: &str) -> Result<Option<String>, String>`
    - `get_loadout(&self, user_id: &str) -> Result<Option<LoadoutSnapshot>, String>`
    - `report_match_events(&self, user_id: &str, events: &[MatchEvent]) -> Result<String, String>`
    - Exponential backoff retry (250ms * 2^attempt), fast fail on 4xx (except 429).
  - Implement `MockNakamaClient` for deterministic testing and offline local fallback.
  - Comprehensive unit tests in `storage/nakama.rs`.

---

## Task 2: Player Combat Stat Derivation Engine
- **Location:** `server-rs/src/content/stats.rs`, `server-rs/src/content/weapons.rs`
- **Specification:**
  - Constants matching `derivedStats.ts`:
    - `GROWTH = 1.045`
    - `STAT_COEF = 0.5`
    - `STAT_MAX = 99.0`
    - `BASE_HP = 108.9`
    - `BASE_ATK = 19.602`
    - `BASE_DEF = 5.94`
    - `GEAR_REFERENCE = 18.0`
    - `UNARMED_GEAR = 0.25`
  - Weapon catalog lookup for equipped weapon ID (`basic_sword`, `apprentice_staff`, etc.) resolving `atk_stat`, `gear`, `rho`.
  - `derived_stats(level: u32, primary: &PrimaryStats, weapon_id: Option<&str>) -> DerivedStats`:
    - `max_health`, `p_atk`, `m_atk`, `p_def`, `m_def`, `max_move_speed`.
  - Unit tests verifying exact numerical parity against `derivedStats.test.ts` (level 1 basic_sword anchor: 110 HP, 22 pAtk, 0 mAtk, 6 pDef, 6 mDef, 20.2 speed).

---

## Task 3: Player Avatar Initialization with Persistent Loadout in Bevy ECS & WebSocket
- **Location:** `server-rs/src/simulation.rs`, `server-rs/src/net/ws.rs`
- **Specification:**
  - Update `AtlasSimulation::spawn_player_avatar`:
    - Accepts `user_id`, `derived_stats: DerivedStats`, `elemental_attrs: ElementalAttributes`, `equipped_skills: Vec<String>`.
    - Spawns player entity with `CombatStats`, `ElementalAttributes`, `CooldownTracker`, `CastingState`, `StatusEffects`.
  - In `server-rs/src/net/ws.rs`:
    - When client connects with token, verify session and query loadout via `NakamaClient`.
    - If loadout found: calculate derived stats and initialize avatar.
    - If offline / Nakama disabled: fall back to default level 1 profile.
  - In `server-rs/src/systems/combat.rs`:
    - On mob kill: record kill match event for the attacking player.

---

## Task 4: Integration Tests & Parity Verification
- **Location:** `server-rs/tests/nakama_persistence.rs`
- **Specification:**
  - Test 1: `verify_session` and `get_loadout` against mock Nakama HTTP server (or wiremock/tokio mock).
  - Test 2: Stat derivation parity matching `contracts/src/meta/derivedStats.ts` across multiple levels and stat allocations.
  - Test 3: Player connect with Nakama token results in properly configured ECS avatar with custom health, defense, attack power, and skill list.
  - Test 4: Match event reporting on mob death.

---

## Task 5: Documentation, Gate 1 Verification & Ship
- Update `server-rs/README.md` with Nakama integration configuration and environment variables.
- Run `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, `cargo test`.
- Run `./scripts/precheck.sh --no-install`.
- Commit changes to `feat/F-063`.
- Ship to `release/1.11` via `psrw ship --no-deploy`.
