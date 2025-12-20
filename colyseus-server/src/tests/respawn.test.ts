import { Player } from '../schemas/Player'
import { GameState } from '../schemas/GameState'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { GAME_CONFIG } from '../config/gameConfig'

describe('Player Respawn', () => {
  let gameState: GameState
  let physicsManager: PlanckPhysicsManager
  let player: Player

  beforeEach(() => {
    gameState = new GameState('test-map', 'test-room')
    physicsManager = new PlanckPhysicsManager()
    physicsManager.setRoomId('test-room')
    
    player = new Player('session-1', 'TestPlayer', 100, 100)
    gameState.players.set('session-1', player)
    
    // Create physics body for player
    physicsManager.createPlayerBody(player)
  })

  afterEach(() => {
    physicsManager.destroy()
  })

  it('should reset health and alive status on respawn', () => {
    player.die()
    expect(player.isAlive).toBe(false)
    expect(player.currentHealth).toBe(0)

    // @ts-ignore - method might not exist yet during TDD
    player.respawn(200, 200)

    expect(player.isAlive).toBe(true)
    expect(player.currentHealth).toBe(player.maxHealth)
  })

  it('should update position on respawn', () => {
    player.x = 100
    player.y = 100
    player.die()

    // @ts-ignore
    player.respawn(300, 300)

    expect(player.x).toBe(300)
    expect(player.y).toBe(300)
  })

  it('should reset behavior to idle on respawn', () => {
    player.currentBehavior = 'attack'
    player.die()

    // @ts-ignore
    player.respawn(200, 200)

    expect(player.currentBehavior).toBe('idle')
  })

  it('should allow movement after respawn', () => {
    player.die()
    // @ts-ignore
    player.respawn(200, 200)

    // Set movement input
    player.input.setMovement(5, 5)
    
    // Process physics
    physicsManager.update(GAME_CONFIG.tickRate, gameState.players, gameState.mobs)
    
    // Check velocity
    const body = physicsManager.getBody(player.id)
    if (body) {
      const velocity = body.getLinearVelocity()
      expect(Math.abs(velocity.x) > 0 || Math.abs(velocity.y) > 0).toBe(true)
    }
  })
})
