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
- `StatusEffects` has freeze, stun and a `knockback_timer` (`server-rs/src/ecs/components.rs:464`); no heal or regeneration.
- Every spawn uses `MobTier::Route` (`server-rs/src/simulation.rs:305,328`), the boss included; one `is_ranged` flag and one attack per mob (`mob_ai.rs:143-190`).
- No NPC or companion in `server-rs/src`; the client has renderers for them.
- Holding attack parries incoming projectiles; a projectile can already be parried only once and is destroyed on a second parry (`bf25f809`), but holding attack has no stamina or timing cost.

## Slices

Order matters: earlier slices unblock later ones.

1. Mob attack wind-up and facing — a visible tell before a mob attack lands, and the attack only hits what it faces.
2. Parry cost — limit how long or how often holding attack can parry, per the owner's decision.
3. Aimed ranged attacks — bow and staff fire projectiles in the aimed direction instead of auto-hitting.
4. Lingering area skills — Meteor and Blizzard leave a field that ticks for its duration.
5. Damage-over-time statuses — burn and poison statuses that tick damage over their duration.
6. Healing in a fight — health regeneration and at least one in-combat heal source.
7. Boss tier scaling at spawn — apply distinct stat and visual scaling to boss spawns.
8. Mob attack variety — mobs with more than one attack ability based on situation.
9. Companion spawn and follow — NPC allies that spawn and follow their player.
10. Companion combat and respawn — companions fight enemy targets and respawn after defeat.

## Depends on

E-006 slice 2 for any wire change; otherwise independent and can run alongside from E-004 slice 3 onward.

Build order across epics: E-006 slices 1 and 2; then E-003; then E-006 slices 3 to 7; then E-004 slices 1 to 3; then E-005 slices 1 to 6; then E-004 slices 4 to 10 and E-006 slice 8; then E-005 slices 7 to 9; E-007 alongside; then E-008; then E-009.

## Out of scope

- Balance tuning beyond making each mechanic work.

## Open questions

- The parry limit (slice 2) is an open owner decision.
- Whether a mob hit by its own reflected projectile is staggered.
