import { Player } from '../schemas/Player'
import { AIModule } from '../ai/AIModule'
import { AIWorldInterface } from '../ai/AIWorldInterface'
import { GameState } from '../schemas/GameState'
import { IAgent } from '../ai/interfaces/IAgent'

describe('Bot Mode Tests', () => {
  let player: Player
  let gameState: GameState
  let worldInterface: AIWorldInterface
  let aiModule: AIModule

  beforeEach(() => {
    // Setup minimal game state
    gameState = new GameState('test-map', 'test-room')
    worldInterface = new AIWorldInterface(gameState)
    aiModule = new AIModule(worldInterface)
    
    // Create player
    player = new Player('session-1', 'Test Player', 100, 100)
    gameState.players.set(player.sessionId, player)
  })

  afterEach(() => {
    aiModule.stop()
  })

  test('Player should implement IAgent interface', () => {
    // Type check (runtime verification of properties)
    const agent: IAgent = player
    expect(agent.id).toBe(player.sessionId)
    expect(agent.x).toBe(100)
    expect(agent.y).toBe(100)
    expect(agent.currentBehavior).toBe('idle')
    expect(typeof agent.applyBehaviorDecision).toBe('function')
  })

  test('setBotMode should toggle isBotMode flag', () => {
    expect(player.isBotMode).toBe(false)
    
    player.setBotMode(true)
    expect(player.isBotMode).toBe(true)
    
    player.setBotMode(false)
    expect(player.isBotMode).toBe(false)
  })

  test('setBotMode(false) should reset AI state', () => {
    player.setBotMode(true)
    player.currentBehavior = 'chase'
    player.desiredVx = 10
    player.desiredVy = 10
    
    player.setBotMode(false)
    
    expect(player.currentBehavior).toBe('idle')
    expect(player.desiredVx).toBe(0)
    expect(player.desiredVy).toBe(0)
  })

  test('AIModule should register Player as agent', () => {
    aiModule.registerAgent(player, {
      behaviors: ['idle'],
      perception: { range: 100, fov: 120 },
      memory: { duration: 1000 }
    })

    // Access private agents map via any cast for testing
    const agents = (aiModule as any).agents
    expect(agents.has(player.id)).toBe(true)
  })

  test('AIWorldInterface should find nearest player for Agent (excluding self)', () => {
    // Add another player
    const otherPlayer = new Player('session-2', 'Other Player', 110, 110)
    gameState.players.set(otherPlayer.sessionId, otherPlayer)

    // Build environment for our test player
    const env = worldInterface.buildAgentEnvironment(player, 100)
    
    // Should find the other player
    expect(env.nearestPlayer).toBeDefined()
    expect(env.nearestPlayer?.id).toBe(otherPlayer.id)
  })

  test('Player update should use desired velocity in Bot Mode', () => {
    player.setBotMode(true)
    player.desiredVx = 10
    player.desiredVy = 0
    
    // Mock updateHeading (since it might rely on internal logic we changed)
    // Actually we verified updateHeading logic in previous step, let's test if heading updates
    
    player.update(16)
    
    // Heading should point right (0 radians)
    expect(player.heading).toBeCloseTo(0)
    
    player.desiredVx = 0
    player.desiredVy = 10
    player.update(16)
    
    // Heading should point down (PI/2 radians)
    expect(player.heading).toBeCloseTo(Math.PI / 2)
  })

  test('Player update should use input in Manual Mode', () => {
    player.setBotMode(false)
    player.desiredVx = 10 // Should be ignored
    player.desiredVy = 0
    
    // Set input
    player.input.setMovement(0, -1) // Move up
    
    player.update(16)
    
    // Heading should point up (-PI/2 radians)
    expect(player.heading).toBeCloseTo(-Math.PI / 2)
  })
})
