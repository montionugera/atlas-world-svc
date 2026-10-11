---
title: "Combat depth"
id: E-007
status: epic
---

# Combat depth

Part of the open-world MMORPG direction (owner, 2026-10-11). Source: the
must-have scan of `server-rs`, `client/react-client` and `nakama` on
`feature/gameplay-combat-parity` at `bf25f809`.

## Outcome

Fights reward reading the enemy and choosing a response: attacks have a tell,
ranged weapons are aimed, area skills linger, health can be recovered without
dying, the boss is a boss, and mobs do not all fight the same way.

## Evidence of the gap

- Mobs fire the instant their cooldown reaches zero (`server-rs/src/systems/mob_ai.rs:132-139`); the old server had an 800 ms wind-up.
- Every weapon is an instant nearest-in-range hit (`server-rs/src/systems/combat.rs:86-116`).
- Area skills detonate once with a 0.5 s lifetime (`server-rs/src/systems/skill_execution.rs:139-190`); `docs/zone-effect.spec.md` specifies a ticking field.
- Only freeze and stun exist (`server-rs/src/ecs/components.rs:464`); no heal or regeneration.
- Every spawn uses `MobTier::Route` (`server-rs/src/simulation.rs:305,328`), the boss included; one `is_ranged` flag and one attack per mob (`mob_ai.rs:143-190`).
- No NPC or companion in `server-rs/src`; the client has renderers for them.
- Holding attack parries every incoming projectile with no time limit (`server-rs/src/systems/projectile.rs`, parry branch).

## Slices

Order matters: earlier slices unblock later ones.

1. Mob attack wind-up and facing — a visible tell before a mob attack lands, and the attack only hits what it faces.
2. Parry cost — limit how long or how often holding attack can parry, per the owner's decision.
3. Aimed ranged attacks — bow and staff fire projectiles in the aimed direction instead of auto-hitting.
4. Lingering area skills — Meteor and Blizzard leave a field that ticks for its duration.
5. Healing and damage over time — burn, poison and regeneration statuses, and a way to heal in a fight.
6. Boss tier and mob attack variety — tier scaling applied at spawn, and mobs with more than one attack.
7. Companions — NPC allies that spawn, follow, fight and respawn.

## Out of scope

- Balance tuning beyond making each mechanic work.

## Open questions

- The parry limit (slice 2) is an open owner decision.
- Whether a mob hit by its own reflected projectile is staggered.
