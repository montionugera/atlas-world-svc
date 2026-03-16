import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { NPC } from '../schemas/NPC'

describe('AI targeting with companion NPCs', () => {
  test('mob targets nearest player or NPC', () => {
    const gameState = new GameState('map-01-sector-a', 'test-room')

    const player = gameState.addPlayer('player-1', 'Tester')
    gameState.addNPC({ id: 'comp-player-1', ownerId: 'player-1', x: 20, y: 20 })
    const npcId = player.activeNPCId
    expect(npcId).toBeTruthy()
    const npc = gameState.npcs.get(npcId) as NPC
    expect(npc).toBeDefined()

    const mob = new Mob({ id: 'mob-1', x: 100, y: 100, vx: 0, vy: 0 })
    gameState.mobs.set(mob.id, mob)

    // NPC closer (10 units) than player (40 units) -> mob targets NPC
    player.x = 140
    player.y = 100
    npc.x = 110
    npc.y = 100

    const env = gameState.worldInterface.buildMobEnvironment(mob, 200)
    expect(env.nearestPlayer).toBeDefined()
    expect(env.nearestPlayer!.id).toBe(npc.id)
    expect(env.distanceToNearestPlayer).toBeCloseTo(10, 5)

    // Move player closer than NPC -> mob targets player
    player.x = 105
    player.y = 100
    const env2 = gameState.worldInterface.buildMobEnvironment(mob, 200)
    expect(env2.nearestPlayer!.id).toBe(player.id)
  })

  test('npc environment exposes owner player for follow behavior', () => {
    const gameState = new GameState('map-01-sector-a', 'test-room')
    const player = gameState.addPlayer('player-1', 'Tester')
    gameState.addNPC({ id: 'comp-player-1', ownerId: 'player-1', x: 20, y: 20 })
    const npcId = player.activeNPCId
    const npc = gameState.npcs.get(npcId) as NPC
    expect(npc).toBeDefined()

    // Move owner and npc apart so follow behavior has a reason to run
    player.x = 50
    player.y = 50
    npc.x = 10
    npc.y = 10

    const env = gameState.worldInterface.buildAgentEnvironment(npc, 200)

    // ownerPlayer is set for follow behavior (same team)
    expect(env.ownerPlayer).toBeDefined()
    expect(env.ownerPlayer!.id).toBe(player.id)

    // nearestPlayer = nearest enemy (opposite team). Here only owner exists, same team, so no enemy.
    expect(env.nearestPlayer).toBeNull()
  })
})

