---
title: "Companion combat and respawn"
id: F-129
status: refined
from_idea: I-180
---

# Companion combat and respawn

## Problem

Allied companions need to assist their owner in combat by attacking nearby hostile mobs, and when defeated in battle they must respawn after a 10-second timer rather than disappearing permanently.

## Acceptance criteria

- [ ] `companion_combat_system` causes a living companion to target and attack hostile mobs within combat range, reducing the mob's health.
- [ ] When a companion's health reaches 0, it enters a defeated state with a `CompanionRespawnTimer` set to `COMPANION_RESPAWN_DELAY_SEC = 10.0` seconds.
- [ ] While defeated before 10 seconds have elapsed, the companion does not attack or move; once the 10-second timer elapses, `companion_respawn_system` respawns the companion alongside its owner with full health.
