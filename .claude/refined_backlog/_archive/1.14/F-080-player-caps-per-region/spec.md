---
title: "Player caps per region"
id: F-080
status: refined
from_idea: I-170
---

# Player caps per region

## Problem

Without a per-region (`room_id`) player cap, an unbounded number of players can join the same region room simultaneously, degrading tick budget and outbound bandwidth for everyone in that region. When a region reaches its configured capacity, new connections must be rejected cleanly with a clear protocol close code and message rather than silently failing or overloading the room.

## Acceptance criteria

- [ ] `server-rs` enforces a configurable maximum number of active player connections per region (`room_id`), defaulting to `100` (`DEFAULT_MAX_PLAYERS_PER_ROOM = 100`, configurable via `ATLAS_MAX_PLAYERS_PER_ROOM` and `WsServer::with_max_players_per_room`).
- [ ] Reconnecting with the same `session_id` into the same `room_id` replaces the existing session connection without being rejected by the room cap.
- [ ] When a new session attempts to join a `room_id` that is already at capacity, the server sends a WebSocket close frame with code `4003` (`REGION_FULL_CLOSE_CODE`) and a descriptive `"region full: ..."` reason, and does not register the connection in the room.
- [ ] The React client (`useServerRsClient`) handles close code `4003` (`REGION_FULL_CLOSE_CODE`) by surfacing a clear region-full error message and halting automatic reconnect loops.
- [ ] Automated tests in `server-rs` and `client/react-client` verify that connections up to the cap succeed, the `(cap + 1)`-th distinct session in the same region receives close code `4003` (`region full`), another region still accepts players when the first region is full, and the client displays the region-full message without auto-reconnecting.
