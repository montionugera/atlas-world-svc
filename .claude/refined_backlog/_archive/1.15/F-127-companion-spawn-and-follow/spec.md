---
title: "Companion spawn and follow"
id: F-127
status: refined
from_idea: I-179
---

# Companion spawn and follow

## Problem

`server-rs` has no allied NPC companion entity that spawns alongside a player and follows them through the world.

## Acceptance criteria

- [ ] `AtlasSimulation::spawn_companion_for_player` spawns an allied companion entity (`CompanionTag`, `CompanionAi`, `Position`, `Velocity`, `Health`, `CombatStats`) alongside the player.
- [ ] `companion_follow_system` steers a living companion toward its owner player whenever distance exceeds `follow_distance` (`<= 5.0` units) and stops within `5.0` units so the companion stays within 5 units as the player moves.
- [ ] Integration tests verify that an allied companion spawns alongside the player and follows to stay within 5 units after the player moves across the region.
