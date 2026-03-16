# Attack: melee, projectile skills, parry

Melee, projectile-based skills, and projectile deflection. Movement and heading are in [mob-movement.spec.md](./mob-movement.spec.md).

## Timing (windup, wind-down, cooldown, ASPD)

- **Windup:** `atkWindUpTime` (ms) — cast/windup before hit; entity `castDuration` is set to this; hit fires at end. Rotation can stay full during windup for aim, reduced during recovery.
- **Wind-down:** `atkWindDownTime` (ms) — recovery after hit; part of the same attack cycle.
- **Cooldown:** Time before next attack. Per attack: optional `cooldown` (ms) on the attack definition overrides default. Default (mobs/NPCs): `attackDelay = atkWindUpTime + baseWindDownTime` (or the attack’s `cooldown` if set). Players: `attackDelay = atkWindUpTime + atkWindDownTime`; skills use a separate cooldown map (action ID → ready timestamp).
- **ASPD:** No separate attack-speed stat. Effective rate is implied by `attackDelay` (e.g. 1000 ms → 1 attack/sec).

## Melee

- **MeleeAttackStrategy:** Range check using attacker radius + target radius + attackRange. Facing check: angle between mob heading and direction to target must be within a threshold (e.g. ~0.5 rad).
- **Flow:** Windup (castDuration = atkWindUpTime); on completion, hit applied (damage, optional impulse); then attackDelay before next attack. BATTLE_ATTACK emitted for persistence/UI.

## Projectile skills

- **Ranged strategies** (e.g. SpearThrowAttackStrategy): Cast starts; on cast end, a projectile is spawned (owner, position, direction from caster heading). ProjectileManager steps projectiles each tick and resolves collisions (vs player, mob, boundary).
- **Speed vs range:** Projectile has `speedUnitsPerSec` and `atkRange`. If `atkRange > 0`, that value is the max range; if `atkRange === 0`, max range is derived from physics (speed, gravity, release height). Effective range can also account for caster radius (e.g. spear arc).
- **On hit:** Damage and impulse applied to target; BATTLE_DAMAGE_PRODUCED emitted; projectile despawned or marked stuck as appropriate.

## Area skills

- **Spec:** Attack characteristic type `AREA` with `areaRadius` and `atkRange` is defined in config/types; area strategies are **not yet implemented** (factory logs a warning and skips).

## Parry / deflect

- **Deflection:** A player (or entity) in an appropriate state (e.g. blocking or attack frame) can deflect incoming projectiles. `GameSimulationSystem.checkProjectileDeflection` (or equivalent) runs against active projectiles; when deflection succeeds, projectile state is updated (e.g. stuck or reflected) and no damage is applied.

## Combat systems

- **MobCombatSystem, PlayerCombatSystem, NPCCombatSystem:** Each entity type has a combat system that owns attack queue, cooldowns, and strategy execution. They call into ProjectileManager for projectile spawn and emit BATTLE_ATTACK when an attack is committed.
- **BattleManager:** Subscribes to BATTLE_ATTACK and BATTLE_HEAL; used for persistence and/or UI action messages.

Next: [ai.spec.md](./ai.spec.md).
