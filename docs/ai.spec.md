# AI

AIModule, behavior selection, targeting, and NPC-specific behaviors. Movement application is in [mob-movement.spec.md](./mob-movement.spec.md).

## AIModule

- **Tick-driven:** Runs at a fixed rate (e.g. 20 FPS). Each tick, for each registered agent: `buildAgentEnvironment(agent, perceptionRange)` → `decideBehavior(agent, env)` → `applyBehaviorDecision(decision)`; then desired velocity (plus optional separation for non-casting agents) is computed, capped, and passed to `applyAIDecision(agentId, { velocity, behavior, timestamp })`, which sets the agent’s `desiredVx`, `desiredVy`, and behavior state.

## Behaviors (mobs)

- **Priority order (high first):** AvoidBoundary, Attack, Chase, Wander.
- **AvoidBoundary:** When near world edges; pushes away; short lock.
- **Attack:** When distance to target ≤ max strategy range (melee: radii + attackRange; ranged: maxRange); can lock ~500 ms.
- **Chase:** When target in range; chase range = max(this.chaseRange, maxEffectiveAttackRange + 15) so mobs do not drop aggro when separation pushes them back.
- **Wander:** Fallback; picks random point, moves toward it; cooldown between new targets.
- **Lock:** `behaviorLockedUntil` prevents rapid switching; attack and avoid-boundary set locks.

## Targeting

- **buildAgentEnvironment:** Nearest target for chase/attack is the nearest **player or NPC** (`getNearestPlayer`), for both mobs and NPCs/bots. When an NPC has `ownerId`, `ownerPlayer` is set for optional follow behavior.
- Mobs can target and attack NPCs (and players); damage is resolved via `BattleModule.getEntity` (players, mobs, npcs).

## NPC behaviors

- **Registration:** NPCs are registered with AIModule with same priority set as bot: avoidBoundary 10, attack 8, chase 5, wander 1 (no npcFollow/npcAttack). They chase/attack mobs and players like bots; no follow-owner for room demo NPCs.
- **Owner:** When `ownerId` is set, `buildAgentEnvironment` sets `ownerPlayer` so follow logic can be added later; current behavior set is shared with standalone NPCs.

## Heading (player bot and NPC)

- **Same rule for both:** When moving, heading is set from movement direction (from desired or actual velocity: `heading = atan2(vy, vx)`). When attacking, heading is set to face the current attack target. Manual player uses input direction for heading.

## Player (bot mode)

- **When enabled:** Player is re-registered with AIModule with `behaviorPriorities`: avoidBoundary 10, attack 8, chase 5, wander 1 (and behaviors list). AI drives desired velocity and behavior only when `player.isBotMode` is true; `applyAIDecision` applies to the player only in that case.
- **When disabled:** Player is unregistered from AIModule; movement and attack come from client input only (PlayerInputHandler, processPlayerInput).

Next: [companion.spec.md](./companion.spec.md).
