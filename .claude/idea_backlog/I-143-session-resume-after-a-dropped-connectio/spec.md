---
title: "Session resume after a dropped connection"
id: I-143
status: idea
---

# Session resume after a dropped connection

## Problem & Goal

When a player's WebSocket connection drops unexpectedly (Wi-Fi blip, mobile network handoff, brief browser stall), the server currently despawns the player avatar immediately on the next tick and the browser client transitions straight to `disconnected` without attempting to reconnect. For a persistent MMORPG (`E-003` Slice 8), a brief network drop should allow the client to automatically reconnect with exponential backoff and reattach to its existing in-world avatar within a server-side grace window, preserving position, health, and combat state. Only when the grace window expires without a reconnect should the server snapshot the player's state and despawn the avatar.

## Acceptance criteria

- [ ] `AtlasSimulation` supports a configurable disconnect grace window (`disconnect_grace_ticks: u32`, with `set_disconnect_grace_ticks` / `disconnect_grace_ticks` helper methods; `main.rs` configures a 5-second grace window at 30 Hz = 150 ticks via `ATLAS_DISCONNECT_GRACE_SEC`, while `AtlasSimulation::live` defaults to `0` ticks so existing zero-grace unit tests continue to pass deterministically).
- [ ] When a player's last WebSocket closes and `disconnect_grace_ticks > 0`, the player's avatar remains in the world with zeroed movement velocity during the grace window rather than being immediately despawned; if the player sends input (reconnects with the same `session_id` / account) before the grace countdown reaches zero, the pending disconnect is cancelled and the player resumes controlling the existing avatar with its position and health intact.
- [ ] If the disconnect grace window expires without the player reconnecting, `live_tick` captures the avatar's `CharacterStateSnapshot` into `LiveFrame::departed_states`, despawns the avatar, and emits its hashed entity ID in `LiveFrame::removed_ids`.
- [ ] `useServerRsClient` automatically retries unexpected WebSocket disconnects (`wasOpen === true`, not initiated by manual `disconnect()`, and close code not `4001` protocol mismatch or `4002` duplicate session) using bounded exponential backoff, and cancels any scheduled retry on manual `disconnect()` or component unmount.
- [ ] Automated tests in `server-rs` and `client/react-client` verify server grace-window retention, same-account reattachment within the grace window, post-grace expiration + state capture + removal, and client auto-reconnect vs terminal close codes (`4001`, `4002`).
