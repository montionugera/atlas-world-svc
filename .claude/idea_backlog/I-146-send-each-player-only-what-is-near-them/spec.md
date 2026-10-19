---
title: "Send each player only what is near them"
id: I-146
status: idea
---

# Send each player only what is near them

## Problem

Broadcasting the entire room's entity list to every connected client scales outbound bandwidth as `O(P × E)` (`~30 MB/s` at 400 entities) and leaks distant entity positions across the whole `4000 × 4000` region. Each player should receive only entities within their Area-of-Interest (`AOI`), with hysteresis on enter/leave and explicit `removed_ids` notifications when an entity walks out of range.

## Acceptance criteria

- [ ] `server-rs` provides `AoiTracker` (`server_rs::spatial::AoiTracker`) using `AOI_ENTER_RADIUS_UNITS` (`600.0`) and `AOI_EXIT_RADIUS_UNITS` (`640.0`) hysteresis to filter `entities`, `removed_ids`, and `events` per viewer (`viewer_id = fnv1a_32(session_id)`).
- [ ] When an entity enters `<= 600.0` units of a player, it appears in that player's snapshot `entities`; while between `600.0` and `640.0` units, its visibility state is preserved (no boundary flicker); when it moves beyond `640.0` units, its ID is emitted in that player's `removed_ids` on the transition tick and omitted on subsequent ticks.
- [ ] `WsServer` supports per-session room snapshot delivery (`active_sessions_in_room`, `send_snapshot_to_session_in_room`) and `main.rs` broadcasts per-player AOI-filtered snapshots each tick.
- [ ] Automated tests verify AOI enter, hysteresis band retention, leave (`removed_ids` emitted once), and multi-client per-session WebSocket delivery where two distant players in the same room receive only nearby entities.
