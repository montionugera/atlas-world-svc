---
title: "Apply the saved character on join"
id: F-071
status: refined
from_idea: I-140
---

# Apply the saved character on join

## Summary

Part of `E-003` (Persistent accounts and characters — Slice 5). Currently, `WsServer::handle_connection` in `server-rs/src/net/ws.rs` fetches `client.get_loadout(&session_id).await` when a player joins, logs the level, and discards the `LoadoutSnapshot`. Later, when the player sends their first `ClientInput` packet, `AtlasSimulation::apply_player_input` (`server-rs/src/simulation.rs:860`) calls `self.spawn_player_avatar(session_id, spawn.x, spawn.y)`, which passes `None` to `spawn_player_avatar_with_loadout`, spawning every player as a Level 1 character with default `PrimaryStats` and `"basic_sword"`.

This slice passes the fetched `LoadoutSnapshot` from the WebSocket handshake into the simulation so the player's avatar spawns with their saved level, allocated primary stats, and equipped weapon (`max_health`, `attack_power`, `defense`, `p_def`, `m_def`, and `max_move_speed` derived from `LoadoutSnapshot`).

## Acceptance criteria

- [ ] When `WsServer::handle_connection` fetches `Ok(Some(loadout))` from `NakamaClient::get_loadout(&session_id)` during WebSocket join, the `LoadoutSnapshot` is stored for `session_id` (and cleared if `Ok(None)` is returned) and exposed so the simulation receives it before spawning the avatar.
- [ ] `AtlasSimulation` caches per-session `LoadoutSnapshot`s (via `set_session_loadout` / `session_loadout` and fallback to the latest handshake loadout for `session_id`), and `AtlasSimulation::apply_player_input` spawns new player avatars via `spawn_player_avatar_with_loadout(session_id, spawn.x, spawn.y, loadout)` instead of `spawn_player_avatar` (`None`).
- [ ] `server-rs/src/main.rs` drains newly fetched session loadouts from `WsServer` each tick before `sim.live_tick` so every simulation room has the player's saved `LoadoutSnapshot` when their first input arrives or when they switch rooms.
- [ ] Integration tests verify that a player joining over WebSocket with a saved `LoadoutSnapshot` (e.g., Level 10 warrior or mage with custom primary stats and weapon) spawns in `live_tick` with the exact derived `max_health`, `attack_power`, `p_def`/`m_def`, and `max_move_speed` from their saved character rather than Level 1 defaults, while a player with no saved loadout (`Ok(None)`) still spawns with Level 1 defaults.
