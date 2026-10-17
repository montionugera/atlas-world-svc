---
title: "Elemental combat system, skill execution, and projectile kinematics in server-rs"
id: I-132
status: idea
---

# Elemental combat system, skill execution, and projectile kinematics in server-rs

## Acceptance criteria

- [ ] `Element` enum (Neutral, Earth, Water, Wind, Fire, Holy, Void) and `getElementMultiplier` table in Rust matching `colyseus-server/src/config/combat/elements.ts` exactly.
- [ ] `DamageCalculator` in Rust matching legacy defense reduction (capped at 80% base damage), elemental advantage multiplier, and minimum 1 damage floor.
- [ ] Skill catalog and cooldown system supporting `skill_1` (Meteor Strike), `skill_2` (Precision Strike), `skill_3` (Blizzard), `skill_4` (Thunder Strike), and `skill_dash` (Dash) with global magic cooldown and per-skill cooldowns.
- [ ] Projectile kinematics system updating projectile positions, checking collisions against targets within radius, and applying damage and status effects (freeze, stun).
- [ ] Bevy ECS combat systems integration running each tick and verified by automated unit and integration tests.
