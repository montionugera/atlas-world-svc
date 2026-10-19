---
title: "Sleeping regions"
id: I-149
status: idea
---

# Sleeping regions

## Problem

When `server-rs` hosts multiple `4000 × 4000` open-world regions, ticking empty regions at 20 Hz wastes CPU on mob AI and physics in unvisited zones. Conversely, if an empty region stops ticking while a mob is dead (`DeadMobTracker`), its respawn countdown would freeze unless the wake transition accounts for the time spent asleep.

## Acceptance criteria

- [ ] `AtlasSimulation` tracks region sleep state (`is_sleeping()`, `sleeping_since_ms()`) and transitions to `Sleeping` when `active_player_count() == 0` (unless forced awake for headless tests), skipping physics, AI, and combat step execution while asleep (`step_if_awake(now_ms, inputs, disconnects)` returns `None` when no players are present).
- [ ] Respawn rule while asleep: when a sleeping region wakes upon player entry (`join_player` or `wake(now_ms)`), all pending `DeadMobTracker` timers in the region are fast-forwarded by the elapsed sleep duration (`elapsed_sec = (now_ms - sleeping_since_ms) / 1000.0`), and any mob whose remaining respawn timer reaches `<= 0.0` respawns immediately at its `MobSpawnAnchor` before the first awake tick executes.
- [ ] Automated unit and integration tests verify that a region with 0 players stops advancing its simulation tick counter while asleep, wakes immediately on player entry, and fast-forwards mob respawn timers according to the elapsed sleep duration.
