import { GameState } from '../schemas/GameState'
import { NPC } from '../schemas/NPC'

describe('NPC spawn (room demo and addNPC)', () => {
  test('seedDemoNPCs creates 5 standalone NPCs in a ring', () => {
    const gameState = new GameState('map-01-sector-a', 'test-room')
    expect(gameState.npcs.size).toBe(0)

    gameState.seedDemoNPCs()

    expect(gameState.npcs.size).toBe(5)
    for (let i = 0; i < 5; i++) {
      const id = `npc-demo-${i}`
      const npc = gameState.npcs.get(id) as NPC
      expect(npc).toBeDefined()
      expect(npc.name).toBe(`NPC ${i + 1}`)
      expect(npc.ownerId).toBe('')
    }
  })

  test('addNPC without ownerId creates standalone NPC', () => {
    const gameState = new GameState('map-01-sector-a', 'test-room')
    const npc = gameState.addNPC({ id: 'standalone-1', x: 10, y: 10 })

    expect(gameState.npcs.get('standalone-1')).toBe(npc)
    expect(npc.ownerId).toBe('')
  })

  test('addNPC with ownerId links to player', () => {
    const gameState = new GameState('map-01-sector-a', 'test-room')
    const player = gameState.addPlayer('p1', 'P1')
    const npc = gameState.addNPC({ id: 'comp-p1', ownerId: 'p1', x: 12, y: 12 })

    expect(player.companionIds).toContain('comp-p1')
    expect(player.activeNPCId).toBe('comp-p1')
    expect(npc.ownerId).toBe('p1')
  })

  test('removePlayer does not remove demo NPCs', () => {
    const gameState = new GameState('map-01-sector-a', 'test-room')
    gameState.seedDemoNPCs()
    gameState.addPlayer('p1', 'P1')
    const demoIds = Array.from(gameState.npcs.keys())

    gameState.removePlayer('p1')

    expect(gameState.players.size).toBe(0)
    for (const id of demoIds) {
      expect(gameState.npcs.has(id)).toBe(true)
    }
  })

  test('removePlayer removes only NPCs with matching ownerId', () => {
    const gameState = new GameState('map-01-sector-a', 'test-room')
    gameState.addPlayer('p1', 'P1')
    gameState.addPlayer('p2', 'P2')
    gameState.addNPC({ id: 'comp-p1', ownerId: 'p1', x: 0, y: 0 })
    gameState.addNPC({ id: 'comp-p2', ownerId: 'p2', x: 0, y: 0 })
    gameState.addNPC({ id: 'standalone', x: 0, y: 0 })

    gameState.removePlayer('p1')

    expect(gameState.npcs.has('comp-p1')).toBe(false)
    expect(gameState.npcs.has('comp-p2')).toBe(true)
    expect(gameState.npcs.has('standalone')).toBe(true)
  })
})
