---
title: "Save and restore region state across a restart"
id: F-105
status: refined
from_idea: I-151
---

# Save and restore region state across a restart

## Problem

When `server-rs` restarts, all region state (active mob coordinates, current HP, pending `DeadMobTracker` respawn timers, and world objects) is discarded and reset to initial seed defaults.

## Acceptance criteria

- [ ] `AtlasSimulation` implements `export_region_state(&self, region_id: &str, saved_at_ms: u64) -> RegionStateSnapshot` and `restore_region_state(&mut self, snapshot: &RegionStateSnapshot)` capturing and restoring active mobs (entity ID, mob type, position, home anchor, current/max HP), pending `DeadMobTracker` timers, and world objects (`WorldObjectRecord`).
- [ ] `AtlasSimulation::save_to_store` and `AtlasSimulation::restore_from_store` (plus server startup/shutdown hooks in `server-rs`) persist and reload region state through `WorldStateStore`.
- [ ] Automated integration tests verify that after modifying mob positions, HP, dead mob respawn timers, and world objects, saving to `WorldStateStore`, and constructing a fresh `AtlasSimulation` (simulating a server restart), `restore_from_store` restores active mobs, respawn timers, and world objects to their exact pre-restart coordinates and states.
