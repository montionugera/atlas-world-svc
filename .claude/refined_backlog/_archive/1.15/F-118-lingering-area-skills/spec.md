---
title: "Lingering area skills"
id: F-118
status: refined
from_idea: I-174
---

# Lingering area skills

## Problem

Area-of-effect skills (`Meteor Strike` and `Blizzard`) currently detonate only once on impact and disappear after 0.5 s instead of leaving a lingering hazard field that ticks damage over its lifetime.

## Acceptance criteria

- [ ] Casting `Meteor Strike` (`skill_1`) or `Blizzard` (`skill_3`) spawns a `LingeringZone` hazard field at the target location with a 3.0-second duration and 1.0-second tick interval (`3` distinct damage intervals).
- [ ] `lingering_zone_system` ticks active `LingeringZone` fields and applies elemental damage (and freeze slow for `Blizzard`) to hostile targets standing inside the field radius at each interval.
- [ ] A target standing inside a `Blizzard` or `Meteor Strike` field takes damage across 3 distinct intervals during the field's lifetime before the zone expires and despawns.
- [ ] A target outside the field radius takes no lingering zone damage.
