---
title: "Healing in a fight"
id: F-122
status: refined
from_idea: I-176
---

# Healing in a fight

## Problem

Players currently have no health regeneration over time and no in-combat heal skill or consumable to recover health during a fight.

## Acceptance criteria

- [ ] Entities with `HealthRegen` or active regeneration status (`StatusEffects::apply_regen`) recover health over time via `health_regen_system`, clamped to `Health::max` while alive.
- [ ] Players can trigger the in-combat heal skill (`skill_heal`, slot 6, or `SkillEffect::Heal`) to immediately restore health during a fight while respecting its cooldown.
- [ ] Integration tests verify that regeneration raises health over time AND the active heal source raises health immediately when used in combat.
