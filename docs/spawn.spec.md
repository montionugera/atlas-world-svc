# Spawn

Mob, player, and companion create/remove. Handlers (physics bodies) in [event-flow.spec.md](./event-flow.spec.md).

## Mob spawn

- **Entry:** `GameState.reInitializeMobs()`. If `mobLifeCycleManager` is set, it calls `MobLifeCycleManager.seedInitial()`; else legacy path (see below).
- **Lifecycle path:** `seedInitial()` calls `clearAllMobs()` then for each `MAP_CONFIG.mobSpawnAreas` spawns `area.count` mobs via `spawnMobInArea` (mob type from area, position in area, strategies from type config).
- **Legacy path:** `clearAllMobs()` (emits MOB_REMOVED per mob, clears `mobs`); then loop by `GAME_CONFIG.mobCount` creates Mob, `mobs.set`, `registerMob`, emit MOB_SPAWNED.
- **Per mob:** Create `Mob` (id, position, radius, attackRange, chaseRange, attackStrategies, stats…); `mobs.set(id, mob)`; `aiModule.registerMob(mob, config)` with behaviors/perception (no behaviorPriorities — uses DEFAULT_AGENT_BEHAVIORS); emit `MOB_SPAWNED`.
- **Handler:** RoomEventHandler handles MOB_SPAWNED → `physicsManager.createMobBody(mob)`.

## Player join

- **Entry:** `GameState.addPlayer(sessionId, name)`.
- **Create:** `Player` at map center (spawnX, spawnY); `players.set(sessionId, player)`; register with AIModule; emit `PLAYER_JOINED`.
- **Handler:** RoomEventHandler handles PLAYER_JOINED → `physicsManager.createPlayerBody(player)`.

## NPC spawn

- **Room demo:** `GameState.seedDemoNPCs()` creates 5 standalone NPCs (no `ownerId`) in a ring around map center. Called once from `GameRoom.onCreate()` after `reInitializeMobs()`. IDs `npc-demo-0` … `npc-demo-4`, names `NPC 1` … `NPC 5`.
- **Generic add:** `GameState.addNPC(options)` — `options.id`, `options.x`, `options.y` required; `ownerId` optional. When `ownerId` is set, owner’s `companionIds` and `activeNPCId` are updated. NPC registered with AIModule (avoidBoundary 10, attack 8, chase 5, wander 1); emit `NPC_SPAWNED`.
- **Player join:** `addPlayer` does **not** spawn NPCs; demo NPCs are room-level only.
- **Handler:** RoomEventHandler handles NPC_SPAWNED → `physicsManager.createNPCBody(npc)` and attaches melee attack strategy.

## Removal

- **Player leave:** `GameState.removePlayer(sessionId)`. Removes only NPCs with `npc.ownerId === sessionId` (unregister, `npcs.delete`, emit NPC_REMOVED). Demo NPCs (no owner) stay. Then unregister player; emit `PLAYER_LEFT`; handler removes player (and any owned NPC) physics bodies.
- **Mob removal:** Lifecycle or explicit removal emits `MOB_REMOVED`; handler removes mob physics body.

Next: [player.spec.md](./player.spec.md).
