---
title: "Authority handoff"
id: F-109
status: refined
from_idea: I-153
---

# Authority handoff

## Problem

When a player walks to the edge of a `4000 × 4000` region that has an adjacent neighbour region, their avatar is clamped at the region boundary and cannot walk into the neighbouring region without disconnecting and opening a new WebSocket connection.

## Acceptance criteria

- [ ] `AtlasSimulation` and `RegionAdjacencyGraph` support seamless border crossing using `HANDOFF_HYSTERESIS_UNITS` (`32.0` units from `WorldModelConfig`): when a player moves outward across a connected region border beyond the hysteresis threshold, `AtlasSimulation::take_outgoing_handoffs` extracts their `PlayerTransferState` (`session_id`, continuous target-region position, velocity, HP/max HP, combat stats, elemental attributes, cooldowns) and removes the avatar from the source region.
- [ ] `AtlasSimulation::accept_incoming_handoff` spawns the transferred player into the destination region at their continuous coordinates with preserved HP, velocity, and cooldowns, and `WsServer::transfer_session_to_room` atomically updates the live WebSocket session's room membership without closing or reconnecting the socket.
- [ ] Automated integration tests verify that a player crossing a border into a neighbouring region keeps the exact same WebSocket socket open, receives snapshots from the destination region, and maintains position continuity within `HANDOFF_HYSTERESIS_UNITS` (`32.0` units).
