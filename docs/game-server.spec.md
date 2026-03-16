# Game server overview

Authoritative realtime simulator for one map instance. Current runtime: **Colyseus** (TypeScript). Target deployment: Agones pods; allocation/auth via Nakama.

**Owns:** Players, mobs, companions, projectiles, zone effects; physics (Planck.js); event-driven lifecycle; skill/cooldown rules.

**Delegates:** Auth, matchmaking, storage → Nakama. Pod lifecycle, capacity → Agones.

**Lifecycle:** Boot → Agones Ready → Allocated (accept joins) → Run (tick loop) → Shutdown (drain, optional match summary).

**Config (env):** `MAP_KEY`, `REGION`, `BUILD_ID`, `CAPACITY`, `TICK_RATE`, `PORT`, `METRICS_PORT`, `HEALTH_PORT`; token verify via `TOKEN_PUBLIC_KEY` or `TOKEN_HMAC_SECRET`.

**Health:** Agones `Ready()` / `Health()` / `Shutdown()`; HTTP `GET /healthz`, `GET /readyz`. Drain when capacity or shutdown scheduled.

**Metrics (Prometheus):** tick duration, physics step, snapshot bytes, entities, connects/denied.

**Security:** Token verify on join; input clamp; sanity caps (speed, range, AoE).

## World boundary

- **Dimensions:** `GAME_CONFIG.worldWidth` × `GAME_CONFIG.worldHeight` (e.g. 1000×1000). Physics world uses same size; static boundary bodies have `boundaryThickness` (e.g. 5).
- **Collision:** Category `BOUNDARY`; players, mobs, NPCs, projectiles collide with it (see physics collision filters). Projectiles that hit boundary are resolved by ProjectileManager (e.g. despawn or stick).
- **AI:** `BoundaryAwareBehavior` (avoidBoundary): when mob is within `boundaryThreshold` (e.g. 20 units) of any edge, it gets a repulsion velocity away from the boundary; priority high so it overrides wander. World bounds are passed into AI as `context.worldBounds`.

## Zone effects

- **Owned by:** `ZoneEffectManager`; creates/updates zone effects; subscribes to skill/placement and drives cast → activate → tick/trigger.
- **Zone state:** `ZoneEffect` has position, `radius`, `castTime`, `duration`, `tickRate`, and an array of `effects` (type, value, chance, interval, duration). Starts inactive; after `castTime` ms, becomes active; entities inside are tested each tick (or at `tickRate`); effects (e.g. damage, heal) applied via BattleModule. Owner casting state is set during castTime; interruption (e.g. stun/death) can cancel the zone.
- **Detail:** [zone-effect.spec.md](./zone-effect.spec.md).

## Terrain zones (speed/friction)

- **Config:** Rectangular zones (ice, grass, mud, sand) with a **friction** value per zone (e.g. ice 0.2, grass 0.8, mud 1.5, sand 1.2). `MAP_CONFIG.getFrictionAtPosition(x,y)` and `getTerrainAtPosition(x,y)` return the value/name for a point; overlap not defined (first matching zone wins).
- **API:** Terrain zones are sent to clients in the welcome payload (`mapConfig.terrainZones`) for visuals/UI.
- **Effect on movement:** **Not yet implemented.** Physics and steering use fixed entity friction; no per-position friction or speed multiplier is applied. To support “ice = faster slide / harder to stop” and “mud = slower,” either: (1) set body friction from `getFrictionAtPosition` each tick, or (2) scale desired velocity by a terrain speed factor (e.g. `1/friction` or explicit `speedMultiplier` per terrain name).
- **Detail:** [terrain.spec.md](./terrain.spec.md).

---

**Simulation detail:** [event-flow.spec.md](./event-flow.spec.md) → [spawn.spec.md](./spawn.spec.md) → [player.spec.md](./player.spec.md) → [mob-movement.spec.md](./mob-movement.spec.md) → [attack.spec.md](./attack.spec.md) → [ai.spec.md](./ai.spec.md) → [companion.spec.md](./companion.spec.md).

**API:** [api.md](./api.md). **Networking:** [networking.spec.md](./networking.spec.md).
