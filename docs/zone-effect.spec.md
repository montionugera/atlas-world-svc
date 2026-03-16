# Zone effects

Ground-placed effects (AoE): cast time, duration, tick/trigger, and effect application. Overview: [game-server.spec.md](./game-server.spec.md).

## Creation

- **ZoneEffectManager.createZoneEffect(x, y, ownerId, skillId, effects, radius, castTime, duration, tickRate):** Creates a `ZoneEffect` and adds it to game state. Owner can be set to casting state for `castTime` ms.
- **Schema:** ZoneEffect extends WorldObject; has `ownerId`, `skillId`, `radius`, `effects[]` (type, value, chance, interval, duration), `castTime`, `duration`, `tickRate`, `isActive`, `createdAt`, `activatedAt`.

## Lifecycle

- **Casting:** Zone is created with `isActive = false`. After `castTime` ms from `createdAt`, manager checks owner (alive, not stunned); if OK, sets `isActive = true`, `activatedAt = now`, clears owner casting state. If owner invalid, zone is removed (interrupted).
- **Active:** Each update, manager iterates zones. For active zones, entities in range are checked via `zone.shouldTrigger(target)` (distance ≤ zone.radius + target.radius). Effects are applied per effect config (e.g. damage/heal via BattleModule); cooldowns (e.g. skill) applied to owner when zone is created or on first trigger as configured.
- **Duration:** Zone is removed when `now - activatedAt >= duration` (or duration &lt; 0 for infinite until manual remove).

## Trigger and effects

- **shouldTrigger(target):** Edge-to-edge: `distance(zone, target) <= zone.radius + target.radius`.
- **Effect types:** Each entry in `effects[]` has `type` (e.g. damage, heal), `value`, `chance`, optional `interval`/`duration` for DoT/status. Tick rate: zone `tickRate` (0 = one-shot or continuous as implemented) and per-effect `interval` drive when effect is applied.

## Integration

- **Skills:** Placement skills create a zone via ZoneEffectManager; skill config defines radius, castTime, duration, tickRate, effects.
- **Battle:** Damage/heal from zones goes through BattleModule; BATTLE_* events can be emitted for persistence/UI.
- **Companions:** Can be hit by zones (AoE/collateral) as per [companion.spec.md](./companion.spec.md).
