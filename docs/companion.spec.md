# Companion (NPC)

Short summary of NPC/companion behavior. Details: [spawn.spec.md](./spawn.spec.md) (lifecycle), [ai.spec.md](./ai.spec.md) (behaviors and targeting).

- **NPC:** Optional `ownerId`; empty = standalone (e.g. room demo). When set, player holds `companionIds` and `activeNPCId`.
- **Room demo:** 5 standalone NPCs per room via `GameState.seedDemoNPCs()` in `GameRoom.onCreate`; not tied to players. See spawn.spec.
- **Spawn / remove:** `GameState.addNPC(options)`; `removePlayer(sessionId)` removes only NPCs with `npc.ownerId === sessionId`; demo NPCs stay. Physics body created/removed by RoomEventHandler on NPC_SPAWNED / NPC_REMOVED.
- **AI:** Shared behavior set: avoidBoundary 10, attack 8, chase 5, wander 1 (no follow-owner for demo NPCs). Owner-bound NPCs can use same set; follow behavior is optional/future.
- **Physics:** NPCs passed as fourth argument (`npcs`) to `PlanckPhysicsManager.update`; `processNPCSteering` runs and positions synced from physics each tick.
- **Targeting:** Mobs target only players (`getNearestPlayerOnly`); they do not aggro NPCs. NPCs can still be hit by AoE or collateral.
- **Respawn:** After death, entity respawns per `respawnTimeMs` (NPC default 10 s). `GameSimulationSystem` uses `battleModule.respawnEntity` then `physicsManager.removeBody` + `createNPCBody`.
- **API:** `companion_command` (socket); REST companions. See [api.md](./api.md).
