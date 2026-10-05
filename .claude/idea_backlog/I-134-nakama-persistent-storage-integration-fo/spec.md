---
title: "Nakama persistent storage integration for player loadout, inventory, and stats in server-rs"
id: I-134
status: idea
---

# Nakama persistent storage integration for player loadout, inventory, and stats in server-rs

## Acceptance criteria

- [ ] `server-rs` implements `NakamaClient` with configurable endpoint (`NAKAMA_BASE_URL`, default `http://127.0.0.1:7350`) and server key (`NAKAMA_HTTP_KEY`, default `defaultkey`) with timeout and exponential backoff retry.
- [ ] `NakamaClient::verify_session(token)` validates session tokens against `GET /v2/account` and extracts `user_id`.
- [ ] `NakamaClient::get_loadout(user_id)` fetches `LoadoutSnapshot` via `POST /v2/rpc/get_loadout?http_key=...&unwrap` and deserializes profile, primary attributes (str, agi, int, vit, dex), equipped weapon/armor items, and skill slots.
- [ ] `server-rs` implements `derived_stats` in Rust (`server-rs/src/content/stats.rs`) calculating `max_health`, `p_atk`, `m_atk`, `p_def`, `m_def`, and `max_move_speed` matching `contracts/src/meta/derivedStats.ts` and `weaponStats.ts` bit-for-bit.
- [ ] In `server-rs/src/net/ws.rs`, when a player client connects and completes authentication, their avatar entity in `AtlasSimulation` is spawned/initialized with their Nakama loadout, derived combat stats, elemental attributes, and equipped skills (with graceful fallback to default profile in mock/offline mode).
- [ ] `NakamaClient::report_match_events(batch)` calls `POST /v2/rpc/report_match_events` to report player combat and mob kill events.
- [ ] Integration tests in `server-rs/tests/nakama_persistence.rs` verify session verification, loadout parsing, derived stat calculation parity, event reporting, and mock fallback behavior.
