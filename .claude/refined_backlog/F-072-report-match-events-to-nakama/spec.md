---
title: "Report match events to Nakama"
id: F-072
status: refined
from_idea: I-141
---

# Report match events to Nakama

Part of Epic `E-003` (Persistent accounts and characters — Slice 6).

## Context & Problem

Currently in `server-rs`:
1. `combat_system` (`server-rs/src/systems/combat.rs`) pushes `mob_kill` events into `MatchEventQueue`, which `AtlasSimulation::live_tick` drains into `LiveFrame::match_events`.
2. `server-rs/src/main.rs` only `debug!`-logs `frame.match_events` and drops them; `NakamaClient::report_match_events` (`server-rs/src/storage/nakama.rs`) has no production caller.
3. `NakamaClient::report_match_events` serializes `MatchEventBatch` with `{ userId, events: [{ eventType, targetId, payload }] }`, whereas `nakama/src/rpc/reportMatchEvents.ts` requires `{ userId, matchId, seq, events: [{ type: 'MOB_KILLED' | 'ITEM_PICKED_UP' | 'ZONE_ENTERED', userId, targetId, count }] }`.
4. In live rooms, `combat_system` resolves `target_id` before `target_anchor.mob_id`, emitting entity instance IDs (`mob-0`) instead of bestiary template IDs when `MobSpawnAnchor` is present.

## Acceptance criteria

- [ ] `combat_system` prefers `MobSpawnAnchor.mob_id` over the runtime `EntityId` when recording a `mob_kill` `MatchEvent`, falling back to `EntityId` when no `MobSpawnAnchor` is attached.
- [ ] `NakamaClient::report_match_events` serializes a wire payload compatible with `nakama/src/rpc/reportMatchEvents.ts` (`userId`, `matchId`, monotonically increasing `seq`, and per-event `type` normalized to `MOB_KILLED` / `ITEM_PICKED_UP` / `ZONE_ENTERED`, `userId`, `targetId`, and positive integer `count`).
- [ ] `MatchEventBuffer` (in `server-rs/src/storage`) buffers drained `(user_id, MatchEvent)` entries for authenticated UUID accounts (skipping non-UUID bot/synthetic IDs), flushes batches on a configurable interval (default 5s), and flushes immediately for any player who disconnects/leaves.
- [ ] `server-rs/src/main.rs` wires `MatchEventBuffer` into the 20 Hz tick loop and graceful shutdown when `nakama_client` is configured, dispatching batches via `report_match_events` without blocking the simulation tick.
- [ ] Integration tests in `server-rs/tests/nakama_persistence.rs` verify buffered interval flushing, immediate on-leave flushing, non-UUID bot filtering, and wire-format compatibility with the Nakama `report_match_events` RPC contract.
