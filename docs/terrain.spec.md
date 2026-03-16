# Terrain zones (area speed / friction)

Rectangular map areas (e.g. ice, grass, mud, sand) that can affect movement speed and stopping. Overview: [game-server.spec.md](./game-server.spec.md).

## Data

- **TerrainZone** (mapConfig): `x`, `y`, `width`, `height`, `friction`, `name`. Zones are axis-aligned rectangles; order in list defines priority when overlapping (first match wins).
- **Typical names:** `ice` (low friction), `grass` (normal), `mud` (high friction), `sand` (medium). Friction values in config are e.g. 0.2 (ice), 0.8 (grass), 1.5 (mud), 1.2 (sand).
- **Helpers:** `MAP_CONFIG.getFrictionAtPosition(x, y)` → friction number; `MAP_CONFIG.getTerrainAtPosition(x, y)` → terrain name string; default when in no zone: friction 0.8, name `'default'`.

## Intended effect on speed

- **Low friction (e.g. ice):** Harder to stop; same impulse gives more slide. Can be modeled by higher body frictionAir or lower linearDamping in physics, or by a speed multiplier &gt; 1 for “sliding” feel.
- **High friction (e.g. mud):** Slower effective movement; easier to stop. Can be modeled by scaling desired velocity by a factor &lt; 1 (e.g. `speedMultiplier = 1 / friction` or a per-name table), or by increasing body friction so steering reaches target speed more slowly.
- **Not yet implemented:** No code path applies `getFrictionAtPosition` to physics bodies or to desired velocity in `PlanckPhysicsManager` / `AIModule`. Clients receive `terrainZones` for display only.

## Integration points (when implemented)

- **Physics:** In the steering/update loop, read `getFrictionAtPosition(body.position)` and either set body `friction`/`frictionAir`/`linearDamping` per tick, or apply a damping/scaling factor to velocity.
- **AI/Steering:** When applying desired velocity for mobs/players, multiply by a terrain speed factor (e.g. from a map `terrainName → speedMultiplier`) so mud reduces effective max speed and ice can optionally increase slide.
- **Slopes (separate):** README mentions `slopes.json` (gradient, upMul/downMul) for elevation-based speed; that is a separate static bundle, not the same as terrain zones.
