---
title: "Remove server-rs external Nakama S2S client and Nakama wiring tests"
id: F-202
status: refined
from_idea: I-285
---

# I-285 Remove server-rs external Nakama S2S client and Nakama wiring tests

## Goal
Remove the external Nakama S2S HTTP client (`NakamaClient`, `NakamaConfig`) and its fallback branch from `server-rs`, leaving `RustMetaEngine` + `SqliteMetaStore` as the sole persistent meta/storage implementation.

## Scope
- `server-rs/src/storage/nakama.rs` and `server-rs/src/storage/mod.rs`: remove `NakamaConfig` and `NakamaClient` (keep the shared domain structs `ProfileDoc`, `LoadoutSnapshot`, `CharacterStateSnapshot`, `MatchEvent`, `MatchEventBatch`, `MockNakamaClient`, and storage trait used by `RustMetaEngine` and `CharacterStateBuffer` / `MatchEventBuffer`).
- `server-rs/src/main.rs`: remove `NakamaConfig::from_env()` and `NakamaClient` branch; always initialize in-process `RustMetaEngine` + `SqliteMetaStore`.
- `server-rs/src/net/ws.rs` and `server-rs/src/lib.rs`: remove `nakama_client` field, `with_nakama()`, and `NakamaClient` re-exports/tests.
- Delete `server-rs/tests/it/nakama_wiring.rs` and `server-rs/tests/it/nakama_persistence.rs`, remove their `mod` declarations in `server-rs/tests/it/main.rs`, and update `server-rs/tests/it/rust_meta_engine.rs` to test `RustMetaEngine` directly without `NakamaClient`.
- Update `server-rs/README.md` to describe the built-in Rust meta engine without external Nakama.

## Acceptance criteria
- [ ] `NakamaClient` and `NakamaConfig` are removed from `server-rs`.
- [ ] `server-rs/tests/it/nakama_wiring.rs` and `server-rs/tests/it/nakama_persistence.rs` are deleted.
- [ ] `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo test --lib` + integration test `rust_meta_engine` pass in `server-rs`.
