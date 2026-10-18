# I-198 — Native Rust Meta Engine and Trait-Backed Persistence (Nakama Replacement)

> Canonical design spec: [`docs/superpowers/specs/2026-10-18-rust-meta-engine-nakama-replacement-design.md`](../../../docs/superpowers/specs/2026-10-18-rust-meta-engine-nakama-replacement-design.md)

## Goal
Replace the external Go/Goja **Nakama + CockroachDB** stack with a native **Rust Meta & Auth Engine (`server-rs/src/meta/`)** built directly into `server-rs`, backed by a trait-based persistence layer (`MetaDocStore`: `InMemoryMetaStore`, embedded `SqliteMetaStore` in WAL mode, and `PostgresMetaStore` conditional-DML SQL transaction adapter) and a drop-in **Nakama `/v2/*` HTTP wire-compatible gateway** so Godot (`MetaGateway.cs`), React (`useServerRsClient.ts`), and `server-rs` real-time rooms run against a single unified Rust binary with zero S2S network overhead and zero external container dependencies in local/single-node deployments.

## Non-Goals
- Rewriting Godot (`MetaGateway.cs`) or React (`useServerRsClient.ts`) client code in Phase 1 (both continue using `/v2/*` wire-compatible endpoints).
- Social/chat/matchmaking lobbies (`E-008`), which will build directly on `server-rs/src/meta/` in a subsequent epic.
- Deleting `contracts/content/{items,skills,quests}.json` (embedded and validated at compile/startup time by `server-rs`).

## Summary of Requirements (EARS)
- **R1 (`MetaDocStore` Trait & Storage Backends):** Atomic multi-document read/write with optimistic concurrency control (`expected_version` CAS, `"*"` for create-only, returning `MetaError::VersionConflict` on mismatch and rolling back the entire batch) and conflict-safe idempotent device account resolution (`authenticate_device`), implemented for `InMemoryMetaStore`, `SqliteMetaStore` (`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;` + `BEGIN IMMEDIATE`), and `PostgresMetaStore` (conditional DML inside SQL transactions).
- **R2 (Schema Migration & Embedded Catalog Integrity):** Canonical default document hydration on RPC storage misses, automatic `profile` v1→v2 migration (`allocated.dex = 1`), safe fallback on corrupt schema versions while preserving OCC `version`, and startup referential integrity validation across `items.json`, `skills.json`, and `quests.json`.
- **R3 (10 Native Gameplay RPCs + `healthcheck`):** Full behavioral parity for S2S RPCs (`get_loadout`, `save_character_state`, `report_match_events`, `grant_xp`, `grant_loot`) with `UNIX_EPOCH`-seeded monotonic sequence numbers across restarts and 2-attempt OCC retries, plus client session RPCs (`equip_item`, `allocate_stats`, `set_skill_loadout`, `accept_quest`, `claim_quest_reward`), strict S2S vs client auth guards, and direct in-process `NakamaStorage` trait implementation.
- **R4 (Drop-In `/v2/*` HTTP Gateway & Unified Wiring):** Serve `POST /v2/account/authenticate/device` (`{ uid, usn, tid, exp }` HS256 JWTs), `GET /v2/account`, `POST /v2/storage` (returning `{"objects":[]}` on missing keys and enforcing `permission_read`), and `GET|POST /v2/rpc/{id}` (supporting both wrapped `{"payload":"..."}` and `?unwrap` raw JSON) on `WsServer` (`:2567`) and optional `META_BIND_ADDR` (`:7350`), while rejecting `/ws?status=` Nakama realtime socket probes with `404`.

## Verification Command
```bash
cargo test --manifest-path server-rs/Cargo.toml && ./scripts/precheck.sh --no-install
```
