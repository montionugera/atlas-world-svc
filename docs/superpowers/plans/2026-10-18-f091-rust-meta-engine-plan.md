# Native Rust Meta Engine and Trait-Backed Persistence (F-091) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the external Go/Goja Nakama + CockroachDB stack with an in-process Rust Meta Engine (`server-rs/src/meta/`) backed by trait-based persistence (`InMemoryMetaStore`, embedded WAL `SqliteMetaStore`, and `PostgresMetaStore`) and a drop-in Nakama `/v2/*` HTTP wire-compatible gateway on `server-rs`.

**Architecture:** `server-rs/src/meta/` provides embedded content catalog validation (`catalogs.rs`), canonical player document models with `profile` v1→v2 schema migration (`models.rs`), atomic CAS multi-document storage behind `MetaDocStore` (`store.rs`), all 10 gameplay RPCs + `healthcheck` + `NakamaStorage` in-process implementation (`engine.rs`), and a `/v2/*` HTTP gateway wired into `WsServer` (`http.rs`, `ws.rs`, `main.rs`).

**Tech Stack:** Rust (`tokio`, `serde`, `serde_json`, `rusqlite` 0.32 bundled WAL, `hmac`/`sha2` HS256 JWT).

**Spec:** `docs/superpowers/specs/2026-10-18-rust-meta-engine-nakama-replacement-design.md`

## Global Constraints

- Zero `unwrap()` / `expect()` on untrusted network or storage inputs in production paths; map all errors through `MetaError` (`Unauthorized -> 401`, `Forbidden -> 403`, `BadRequest -> 400`, `NotFound -> 404`, `VersionConflict -> 409`, `Internal -> 500`).
- Preserve existing `NakamaClient` and `WsServer::with_nakama` API compatibility and preserve the `"Nakama not configured"` startup stdout substring when `NAKAMA_URL` is unset so `tests/nakama_wiring.rs` and `tests/nakama_persistence.rs` pass without modification.
- When `META_DB_PATH` is unset, default `RustMetaEngine` to `InMemoryMetaStore` so `cargo test` never creates untracked `.db` files in the repository tree; when `META_DB_PATH` is set, use `SqliteMetaStore` with `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;` and `BEGIN IMMEDIATE` transactions.
- Format with `cargo fmt` and pass `cargo clippy --manifest-path server-rs/Cargo.toml --all-targets -- -D warnings` with zero warnings.

---

### Task 1: Meta Domain Models, Schema Migration (`v1 -> v2`), and Embedded Catalog Integrity

**Files:**
- Create: `server-rs/src/meta/mod.rs`
- Create: `server-rs/src/meta/models.rs`
- Create: `server-rs/src/meta/catalogs.rs`
- Modify: `server-rs/src/lib.rs`

**Interfaces:**
- Consumes: `crate::storage::{AllocatedStats, CharacterStateDoc, EquippedSlots, LoadoutSnapshot, ProfileDoc, SkillUnlock}`
- Produces:
  - `pub enum MetaError { Unauthorized(String), Forbidden(String), BadRequest(String), NotFound(String), VersionConflict(String), Internal(String) }`
  - `pub struct InventoryDoc`, `pub struct EquipmentDoc`, `pub struct SkillsDoc`, `pub struct QuestsDoc`, `pub type QuestsSeqDoc = HashMap<String, u64>`
  - `pub fn migrate_profile_value(raw: &serde_json::Value) -> Option<ProfileDoc>`
  - `pub struct MetaCatalogs { pub items: HashMap<String, ItemDef>, pub skills: HashMap<String, SkillDef>, pub quests: HashMap<String, QuestDef> }`
  - `MetaCatalogs::load_embedded() -> Result<Self, String>` and `pub fn validate_catalog_integrity(items: &HashMap<String, ItemDef>, skills: &HashMap<String, SkillDef>, quests: &HashMap<String, QuestDef>) -> Result<(), String>`

- [ ] **Step 1: Write the failing unit tests in `server-rs/src/meta/models.rs` and `server-rs/src/meta/catalogs.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn migrates_profile_v1_to_v2_adding_default_dex() {
        let v1 = json!({
            "schemaVersion": 1,
            "level": 3,
            "xp": 50,
            "statPoints": 6,
            "allocated": { "str": 4, "agi": 2, "int": 1, "vit": 3 }
        });
        let doc = migrate_profile_value(&v1).expect("should migrate v1 profile");
        assert_eq!(doc.schema_version, 2);
        assert_eq!(doc.level, 3);
        assert_eq!(doc.xp, 50);
        assert_eq!(doc.stat_points, 6);
        assert_eq!(doc.allocated.str, 4);
        assert_eq!(doc.allocated.dex, 1);
    }

    #[test]
    fn corrupt_schema_version_returns_none_for_fallback() {
        let bad = json!({ "schemaVersion": 0, "level": 99 });
        assert!(migrate_profile_value(&bad).is_none());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path server-rs/Cargo.toml meta::`
Expected: FAIL (module `meta` does not exist yet).

- [ ] **Step 3: Implement `server-rs/src/meta/models.rs`, `server-rs/src/meta/catalogs.rs`, and `server-rs/src/meta/mod.rs`**

Implement `MetaError` (with HTTP status code + gRPC error code mapping), all 5 collection document structs (`ProfileDoc`, `InventoryDoc`, `EquipmentDoc`, `SkillsDoc`, `QuestsDoc`) + `QuestsSeqDoc`, `migrate_profile_value`, and `MetaCatalogs::load_embedded()` using `include_str!("../../../contracts/content/{items,skills,quests}.json")` plus `validate_catalog_integrity`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path server-rs/Cargo.toml meta::`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server-rs/src/lib.rs server-rs/src/meta/
git commit -m "feat(meta): add Rust meta domain models, profile v1->v2 migration, and catalog integrity (F-091)"
```

---

### Task 2: Trait-Backed Persistence (`MetaDocStore`: `InMemoryMetaStore`, `SqliteMetaStore`, and `PostgresMetaStore`)

**Files:**
- Modify: `server-rs/Cargo.toml`
- Create: `server-rs/src/meta/store.rs`
- Modify: `server-rs/src/meta/mod.rs`

**Interfaces:**
- Consumes: `crate::meta::models::MetaError`
- Produces:
  - `pub struct StoredDoc { pub collection: String, pub key: String, pub user_id: String, pub value: Value, pub version: String, pub permission_read: u8, pub permission_write: u8 }`
  - `pub struct DocWrite { pub collection: String, pub key: String, pub user_id: String, pub value: Value, pub expected_version: Option<String>, pub permission_read: u8, pub permission_write: u8 }`
  - `pub struct UserAccount { pub user_id: String, pub username: String, pub device_id: String }`
  - `pub trait MetaDocStore: Send + Sync { fn read_doc(...) -> Result<Option<StoredDoc>, MetaError>; fn write_batch(&self, writes: &[DocWrite]) -> Result<Vec<String>, MetaError>; fn authenticate_device(&self, device_id: &str, username_hint: Option<&str>, create: bool) -> Result<UserAccount, MetaError>; fn get_account(&self, user_id: &str) -> Result<Option<UserAccount>, MetaError>; }`
  - `pub struct InMemoryMetaStore`, `pub struct SqliteMetaStore`, `pub struct PostgresMetaStore`

- [ ] **Step 1: Add `rusqlite` dependency and write failing store tests in `server-rs/src/meta/store.rs`**

Add `rusqlite = { version = "0.32", features = ["bundled"] }` to `server-rs/Cargo.toml` and write tests verifying:
1. `write_batch` with `expected_version = Some("*")` succeeds on create, fails on second create with `MetaError::VersionConflict`, succeeds with the returned version, and rolls back an entire multi-doc batch if any single doc's `expected_version` is stale (tested across `InMemoryMetaStore`, `SqliteMetaStore`, and `PostgresMetaStore`).
2. `SqliteMetaStore` file persistence across close + reopen in a temp directory retains all committed docs and device accounts.
3. Concurrent `authenticate_device("device-race-001", None, true)` calls across threads return the exact same `user_id` and `username`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path server-rs/Cargo.toml meta::store`
Expected: FAIL

- [ ] **Step 3: Implement `InMemoryMetaStore`, `SqliteMetaStore` (WAL + `BEGIN IMMEDIATE`), and `PostgresMetaStore` in `server-rs/src/meta/store.rs`**

Implement:
- `InMemoryMetaStore` with a single `RwLock<InnerState>` so multi-doc `write_batch` and `authenticate_device` are strictly atomic.
- `SqliteMetaStore` wrapping `Mutex<rusqlite::Connection>`, initializing `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;`, creating `meta_documents` and `meta_accounts` tables, using `TransactionBehavior::Immediate` (`BEGIN IMMEDIATE`) in `write_batch`, and conflict-safe `INSERT INTO meta_accounts ... ON CONFLICT(device_id) DO NOTHING` in `authenticate_device`.
- `PostgresMetaStore` with conditional SQL transaction execution (`INSERT INTO meta_documents ... ON CONFLICT DO NOTHING` when `expected_version == Some("*")`, `UPDATE meta_documents SET value_json = $1, version = $2 WHERE ... AND version = $3` when updating a specific version, rolling back the transaction when `rows_affected == 0`) backed by a pluggable `PostgresSqlExecutor` trait (with an embedded transactional SQL backend for deterministic `cargo test` execution and connection string parser for `META_POSTGRES_URL`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path server-rs/Cargo.toml meta::store`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server-rs/Cargo.toml server-rs/Cargo.lock server-rs/src/meta/
git commit -m "feat(meta): implement MetaDocStore for InMemory, SQLite WAL, and Postgres (F-091)"
```

---

### Task 3: Native Rust Meta Engine — All 10 Gameplay RPCs + `healthcheck` + In-Process `NakamaStorage`

**Files:**
- Create: `server-rs/src/meta/engine.rs`
- Modify: `server-rs/src/meta/mod.rs`

**Interfaces:**
- Consumes: `MetaDocStore`, `MetaCatalogs`, `MetaError`, `crate::storage::{NakamaStorage, NakamaError, LoadoutSnapshot, CharacterStateDoc, MatchEventBatch}`
- Produces:
  - `pub struct RpcContext { pub user_id: Option<String>, pub username: Option<String> }`
  - `pub struct RustMetaEngine` with `pub fn new(store: Arc<dyn MetaDocStore>) -> Result<Self, String>`, `pub fn invoke_rpc(&self, ctx: &RpcContext, rpc_id: &str, payload_raw: &str) -> Result<Value, MetaError>`, `pub fn drain_notifications(&self, user_id: &str) -> Vec<MetaNotification>`, and `impl NakamaStorage for RustMetaEngine`

- [ ] **Step 1: Write failing unit tests for all 10 RPCs and `NakamaStorage` in `server-rs/src/meta/engine.rs`**

Write tests covering:
- `get_loadout` (default hydration, equipped `instanceId` -> `itemId` resolution, stale `instanceId` -> `None`, `profile` v1→v2 migration).
- `grant_xp` (`xp_to_next = 100 * level`, multi-level-up `+3 statPoints` per level) and `allocate_stats` (valid spend vs overspend/negative rejection).
- `grant_loot` (stackables merge qty, uniques mint UUIDv4 `instanceId`) and `equip_item` (equip weapon, unequip with `None`, reject unowned `instanceId` or wrong slot).
- `set_skill_loadout` (accept unlocked <= 4, reject > 4 or locked skill).
- `accept_quest`, `report_match_events` (`MOB_KILLED` progression, `seq` deduplication, attribution mismatch `event.userId != batch.userId` rejection, bounded 64-entry notification ring buffer), and `claim_quest_reward` (atomic 3-doc update across `profile`, `inventory`, `quests`, rejecting double-claim).
- `save_character_state` (`seq` deduplication) and in-process `NakamaStorage` calls with `UNIX_EPOCH`-seeded monotonic sequence numbers across restarts.
- S2S vs Client session auth enforcement (reject client calling `grant_xp`, reject S2S calling `allocate_stats`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path server-rs/Cargo.toml meta::engine`
Expected: FAIL

- [ ] **Step 3: Implement `RustMetaEngine` in `server-rs/src/meta/engine.rs`**

Implement all 10 RPCs + `healthcheck` with 2-attempt OCC retry loops on `MetaError::VersionConflict`, `UNIX_EPOCH`-seeded `in_process_event_seq` / `in_process_state_seq`, bounded 64-entry per-user `VecDeque<MetaNotification>`, and `impl NakamaStorage for RustMetaEngine`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path server-rs/Cargo.toml meta::engine`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server-rs/src/meta/
git commit -m "feat(meta): implement RustMetaEngine with 10 gameplay RPCs and in-process NakamaStorage (F-091)"
```

---

### Task 4: Drop-In `/v2/*` HTTP Gateway, JWT Signer, `/ws?status=` Guard, Unified `main.rs` Wiring, & `README.md`

**Files:**
- Modify: `server-rs/src/auth/jwt.rs`
- Create: `server-rs/src/meta/http.rs`
- Modify: `server-rs/src/net/ws.rs`
- Modify: `server-rs/src/main.rs`
- Create: `server-rs/tests/rust_meta_engine.rs`
- Modify: `README.md`

**Interfaces:**
- Consumes: `RustMetaEngine`, `AuthGuard`, `WsServer`
- Produces:
  - `AuthGuard::issue_session_token(&self, uid: &str, usn: &str, exp_offset_sec: i64) -> String` (available in all builds, emitting `{ uid, usn, tid, exp }`)
  - `pub async fn handle_meta_http(...)` and `pub async fn spawn_meta_http_listener(bind_addr: &str, ...)` in `server-rs/src/meta/http.rs`
  - `WsServer::with_meta_engine(self, engine: Arc<RustMetaEngine>, http_key: String, server_key: String) -> Self` (while preserving `WsServer::with_nakama`)
  - `/ws?status=` or `/ws?lang=` 404 guard in `WsServer` before WebSocket upgrade

- [ ] **Step 1: Write failing E2E HTTP & WebSocket integration tests in `server-rs/tests/rust_meta_engine.rs`**

Write integration tests verifying:
1. `OPTIONS` preflight and `POST /v2/account/authenticate/device?create=true` with Basic auth (`defaultkey:`) returns 200 OK and a valid `{ token }` with `{ uid, usn, tid, exp }`; concurrent requests for the same `device_id` return the same `uid`.
2. `GET /v2/account` with `Bearer <token>` returns `{ user: { id, username } }`.
3. `POST /v2/storage` returns `{"objects": []}` before any documents are written, returns stored documents after RPC writes, and refuses to return `quests_seq` (`permission_read == 0`).
4. `POST /v2/rpc/allocate_stats` (wrapped SDK mode without `?unwrap` and with JSON-encoded string body) returns `{"payload": "{\"profile\":...}"}`, while `POST /v2/rpc/get_loadout?http_key=defaulthttpkey&unwrap` returns unwrapped JSON directly; `NakamaClient` pointed at `WsServer`'s port passes full `get_loadout`, `save_character_state`, and `report_match_events` round-trips!
5. `GET /ws?lang=en&status=true&token=<jwt>` (Godot `Nakama.Socket` probe) returns HTTP `404 Not Found` without spawning a player entity, whereas normal gameplay WebSocket join (`/?token=<jwt>`) connects, hydrates the player's level/stats/equipment/position from `RustMetaEngine`, and flushes character state on disconnect.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path server-rs/Cargo.toml --test rust_meta_engine`
Expected: FAIL

- [ ] **Step 3: Implement `AuthGuard::issue_session_token`, `server-rs/src/meta/http.rs`, `WsServer` routing, and `main.rs` wiring**

1. In `server-rs/src/auth/jwt.rs`, expose `generate_nakama_token` in non-test builds and add `pub fn issue_session_token(&self, uid: &str, usn: &str, ttl_secs: i64) -> String`.
2. In `server-rs/src/meta/http.rs`, implement HTTP request parsing (supporting chunked/content-length bodies up to 64 KiB, Basic & Bearer header parsing, query param parsing for `create`, `username`, `http_key`, `unwrap`, and CORS headers `Access-Control-Allow-Headers: content-type, authorization`) and route `/v2/account/authenticate/device`, `/v2/account`, `/v2/storage`, and `/v2/rpc/*`.
3. In `server-rs/src/net/ws.rs`, route `/v2/*` HTTP requests (and `OPTIONS /v2/*`) to `meta::http`, reject `/ws` requests whose query string contains `status=` or `lang=` with `404 Not Found` before WebSocket upgrade, widen internal storage handle to `Arc<dyn NakamaStorage>`, and add `with_meta_engine` while keeping `with_nakama` unchanged.
4. In `server-rs/src/main.rs`, when `NAKAMA_URL` is unset, print `"Nakama not configured (NAKAMA_URL unset); using in-process RustMetaEngine"` (preserving `tests/nakama_wiring.rs` compatibility) and initialize `RustMetaEngine` with `SqliteMetaStore` (when `META_DB_PATH` is set), `PostgresMetaStore` (when `META_POSTGRES_URL` is set), or `InMemoryMetaStore` (default), plus optional `META_BIND_ADDR` listener.

- [ ] **Step 4: Run E2E tests and full `server-rs` test suite**

Run: `cargo test --manifest-path server-rs/Cargo.toml`
Expected: PASS (all existing `nakama_persistence`, `nakama_wiring`, `ws`, and new `rust_meta_engine` tests pass).

- [ ] **Step 5: Update `README.md` & Architecture Documentation**

Update `README.md` to document the unified `server-rs` Meta Engine (`server-rs/src/meta/`), `/v2/*` wire-compatible endpoints, and environment variables (`META_DB_PATH`, `META_POSTGRES_URL`, `META_BIND_ADDR`, `NAKAMA_SERVER_KEY`, `NAKAMA_URL`).

- [ ] **Step 6: Commit and run Phase Gate**

```bash
git add server-rs/ README.md
git commit -m "feat(server-rs): wire drop-in /v2/* HTTP gateway and unified RustMetaEngine (F-091)"
```
