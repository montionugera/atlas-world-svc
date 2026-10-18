---
title: "Native Rust Meta Engine and Trait-Backed Persistence (Nakama Replacement)"
id: I-198
status: idea
---

# Native Rust Meta Engine and Trait-Backed Persistence (Nakama Replacement)

Canonical design spec: [`docs/superpowers/specs/2026-10-18-rust-meta-engine-nakama-replacement-design.md`](../../../docs/superpowers/specs/2026-10-18-rust-meta-engine-nakama-replacement-design.md)

## Problem

`atlas-world-svc` already migrated its real-time simulation from Colyseus (Node/TS) to `server-rs` (Rust/Bevy ECS/Rapier2D), yielding massive latency, throughput, and operational gains. However, persistent meta-systems (device auth, profile/stats, inventory, equipment, skills, quests, and character state) still run on a separate **Nakama (Go + embedded Goja ES5 JS runtime) + CockroachDB** stack (`nakama/src/`). This ~900-line TS layer requires two heavyweight containers (`nakama` + `cockroachdb`), an `esbuild` IIFE bundle step to work around Goja runtime bugs, an S2S HTTP hop on every player join and periodic state/event flush, and duplicated domain schemas across TypeScript and Rust.

## Why now

- `server-rs` already implements HS256 JWT validation (`src/auth/jwt.rs`), `ProfileDoc`, `PrimaryStats`, `EquippedItemIds`, `CharacterStateSnapshot`, `LoadoutSnapshot`, `MatchEventBatch`, and the `NakamaStorage` trait (`src/storage/nakama.rs`).
- Replacing Nakama with a native `server-rs/src/meta/` module backed by a `MetaDocStore` trait (embedded SQLite WAL + Postgres adapter + in-memory test store) and a drop-in `/v2/*` HTTP wire gateway eliminates the S2S hop and external container requirement while keeping Godot (`MetaGateway.cs`) and React (`useServerRsClient.ts`) 100% compatible with zero client code changes in Phase 1.

## Sketch

1. **`MetaDocStore` Trait & Backends (`server-rs/src/meta/store.rs`)**:
   - Atomic CAS `write_batch`, `read_doc`, and `authenticate_device` with `InMemoryMetaStore`, `SqliteMetaStore` (bundled `rusqlite` in WAL mode), and `PostgresMetaStore` support.
2. **Embedded Meta Catalogs & Models (`server-rs/src/meta/{models,catalogs}.rs`)**:
   - Embed `contracts/content/{items,skills,quests}.json`, enforce `validate_catalog_integrity`, and support `profile` v1→v2 schema migration (`allocated.dex = 1`).
3. **`RustMetaEngine` (`server-rs/src/meta/engine.rs`)**:
   - Native Rust implementation of all 10 RPCs (`get_loadout`, `save_character_state`, `report_match_events`, `grant_xp`, `grant_loot`, `equip_item`, `allocate_stats`, `set_skill_loadout`, `accept_quest`, `claim_quest_reward`) + `healthcheck`.
   - Implements `NakamaStorage` directly so `server-rs` rooms hydrate loadouts and flush buffers in-process without HTTP overhead.
4. **Drop-In Nakama `/v2/*` HTTP Gateway (`server-rs/src/meta/http.rs` & `src/net/ws.rs`)**:
   - Serves `POST /v2/account/authenticate/device`, `GET /v2/account`, `POST /v2/storage`, and `GET|POST /v2/rpc/<id>` (both wrapped Nakama SDK envelopes and `?unwrap` raw JSON) on `WsServer` (and optional `META_BIND_ADDR`).

## Acceptance criteria

- [ ] `MetaDocStore` (`server-rs/src/meta/store.rs`) provides atomic multi-document optimistic-concurrency (`version` CAS) reads/writes and device account mapping across `InMemoryMetaStore`, `SqliteMetaStore` (WAL mode), and `PostgresMetaStore`.
- [ ] `MetaCatalogs` (`server-rs/src/meta/catalogs.rs`) embeds `contracts/content/{items,skills,quests}.json` and enforces cross-catalog referential integrity (`validate_catalog_integrity`), while `models.rs` enforces canonical default docs and `profile` v1→v2 schema migration (`allocated.dex = 1`).
- [ ] `RustMetaEngine` (`server-rs/src/meta/engine.rs`) implements all 10 gameplay RPCs (`get_loadout`, `save_character_state`, `report_match_events`, `grant_xp`, `grant_loot`, `equip_item`, `allocate_stats`, `set_skill_loadout`, `accept_quest`, `claim_quest_reward`) + `healthcheck` with 100% contract parity and implements `NakamaStorage` for zero-hop in-process `server-rs` room hydration and buffer flushing.
- [ ] `WsServer` (`server-rs/src/net/ws.rs` + `src/meta/http.rs`) serves drop-in Nakama `/v2/*` wire-compatible HTTP routes (`POST /v2/account/authenticate/device`, `GET /v2/account`, `POST /v2/storage`, `GET|POST /v2/rpc/<id>` with both wrapped SDK envelopes and `?unwrap`), verified by automated integration tests covering auth, storage reads, all 10 RPCs, SQLite WAL persistence across restarts, and live WebSocket player hydration.
