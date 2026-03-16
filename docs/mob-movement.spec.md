# Mob movement and heading

How mob desired velocity is produced, applied in physics, and how heading is updated. AI behavior selection is in [ai.spec.md](./ai.spec.md).

## Move speed

- **Mob:** Each mob has `maxMoveSpeed` (units/sec). Source: mob type config `stats.maxMoveSpeed` or default from combat config. Desired velocity from AI is capped to `maxMoveSpeed` (e.g. in separation and in applyAIDecision). Global cap/config can use `GAME_CONFIG.mobSpeedRange` (e.g. for boundary-avoidance scaling).
- **Player:** Capped by `maxLinearSpeed` / `maxMoveSpeed` from player stats; see [player.spec.md](./player.spec.md).

## Desired velocity

- **AIModule** (tick-driven): For each registered agent (mob, NPC, or bot-mode player), `buildAgentEnvironment` and `decideBehavior` yield a behavior decision with `desiredVelocity`. After optional separation (non-casting agents), the result is written via `applyAIDecision` (agent’s `desiredVx`, `desiredVy`).
- **Physics application:** `PlanckPhysicsManager.processMobSteering(mobs)` and `processNPCSteering(npcs)` read each entity’s `desiredVx`/`desiredVy`, compute steering force, apply to the body. For players: `processPlayerInput` uses client input (or, when bot, AI has already set desired velocity on the player and steering uses it). All called from `physicsManager.update(..., players, mobs, npcs)`.

## Steering

- **Model:** P-controller. `steeringForce = (desiredVelocity - currentVelocity) * steeringAcceleration * mass`; applied to the body. `steeringAcceleration` is a fixed constant (e.g. 2).
- **Mob body tuning:** `linearDamping: 0.3` (velocity decay to avoid endless jiggle); `restitution: 0.1` (low bounce so mobs do not pinball).

## Separation

- **AIModule.calculateSeparation(agent):** Same-team agents only. Separation radius = agent radius + other radius + padding (e.g. 15). Repulsion strength scales with overlap; weight base = `maxMoveSpeed * 4`. Result is averaged over neighbors and added to desired velocity; combined vector is capped to `maxMoveSpeed`.
- Applied only when the agent is not casting.

## Heading

- **Mob.updateHeadingToTarget(deltaTime):** Target position comes from `currentChaseTarget` or `currentAttackTarget` (player/mob position). Desired angle = `atan2(dy, dx)`. Current `heading` is interpolated toward that angle with a max delta per frame (`rotationSpeed * (deltaTime/1000)`); during cast/attack, rotation speed is scaled (e.g. 0.5x).
- **Use:** Heading drives projectile direction for ranged attacks and melee facing checks (e.g. within ~0.5 rad of target direction to execute).

Next: [attack.spec.md](./attack.spec.md).
