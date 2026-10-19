---
title: "Death, bind point and travel"
id: F-144
status: refined
from_idea: I-160
---

# Death, bind point and travel

## Acceptance criteria

- [ ] `BindPoint` and death XP/durability penalty (`apply_death_penalty_and_bind_respawn`) deducts a bounded XP penalty (never de-leveling the player) and respawns the player at their bound sanctuary/town coordinates (`server-rs/tests/death_bind_and_travel_test.rs`).
- [ ] `fast_travel_to_waypoint` validates discovered waypoints and teleports an out-of-combat player across the open world to the destination coordinates.
