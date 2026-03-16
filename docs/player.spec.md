# Player

Player state, input, movement. Spawn: [spawn.spec.md](./spawn.spec.md).

## State

- **Schema:** Player (Colyseus); position `x`, `y`; velocity `vx`, `vy`; `isAlive`; `activeNPCId` (companion); input and gameplay flags as defined in the schema.
- State is synced to clients via Colyseus.

## Input

- **PlayerInputHandler** (or equivalent) receives client messages and updates the player's input schema (e.g. move direction, attack pressed).
- Movement intent: desired `vx`, `vy` (or normalized direction). Action: e.g. attack flag.

## Movement

- **Physics:** `PlanckPhysicsManager.processPlayerInput(players)` runs each tick. For each alive player, desired velocity is derived from input; a steering/acceleration force is applied (e.g. proportional to velocity error); physics body is updated.
- **Move speed:** Player velocity is capped by `maxLinearSpeed` (synced to clients), set from `PLAYER_STATS.maxMoveSpeed` (default e.g. 20 units/sec). Same value used as `maxMoveSpeed` for AI when player is bot-driven.
- After the physics step, `syncAllEntitiesFromPhysics` copies body position and velocity back to `Player.x`, `Player.y`, `Player.vx`, `Player.vy`.
- **Boundary:** World bounds applied so the player stays in the play area (see [game-server.spec.md](./game-server.spec.md) § World boundary).

## Bot mode

- When enabled, the player is registered as an AI agent; the AIModule can drive desired velocity and behavior like other agents. Details in [ai.spec.md](./ai.spec.md).

Next: [mob-movement.spec.md](./mob-movement.spec.md).
