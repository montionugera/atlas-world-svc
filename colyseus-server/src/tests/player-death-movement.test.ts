/**
 * Tests for preventing dead players from moving
 */

import { Player } from '../schemas/Player'
import { GameState } from '../schemas/GameState'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { GAME_CONFIG } from '../config/gameConfig'

describe('Player Death Movement Prevention', () => {
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

  describe('Movement Input Blocking', () => {
    it('should prevent dead players from processing movement input', () => {
      // Set player as dead
      player.die()
      expect(player.isAlive).toBe(false)

      // Try to set movement input
      player.input.setMovement(5, 5)
      
      // Process physics - dead player should not move
      physicsManager.update(GAME_CONFIG.tickRate, gameState.players, gameState.mobs)
      
      // Get body velocity - should be zero
      const body = physicsManager.getBody(player.id)
      if (body) {
        const velocity = body.getLinearVelocity()
        expect(velocity.x).toBe(0)
        expect(velocity.y).toBe(0)
      }
    })

    it('should stop existing velocity when player dies', () => {
      // Player is alive and moving
      player.input.setMovement(5, 5)
      physicsManager.update(GAME_CONFIG.tickRate, gameState.players, gameState.mobs)
      
      // Get initial velocity (should be non-zero)
      const body = physicsManager.getBody(player.id)
      if (body) {
        const initialVelocity = body.getLinearVelocity()
        const hasVelocity = Math.abs(initialVelocity.x) > 0.1 || Math.abs(initialVelocity.y) > 0.1
        
        // Kill the player
        player.die()
        expect(player.isAlive).toBe(false)
        
        // Process physics again - should stop velocity
        physicsManager.update(GAME_CONFIG.tickRate, gameState.players, gameState.mobs)
        
        const finalVelocity = body.getLinearVelocity()
        expect(finalVelocity.x).toBe(0)
        expect(finalVelocity.y).toBe(0)
      }
    })

    it('should clear input for dead players', () => {
      // Set movement input
      player.input.setMovement(5, 5)
      expect(player.input.getMovementMagnitude()).toBeGreaterThan(0)
      
      // Kill player
      player.die()
      
      // Clear input (simulating what happens in GameRoom)
      player.input.clear()
      
      expect(player.input.getMovementMagnitude()).toBe(0)
    })
  })

  describe('Attack Input Blocking', () => {
    it('should prevent dead players from attacking', () => {
      player.die()
      expect(player.isAlive).toBe(false)
      
      // Try to attack
      player.input.attack = true
      const result = player.processAttackInput(new Map(), 'test-room')
      
      expect(result).toBe(false)
    })
  })

  describe('Heading Update Blocking', () => {
    it('should prevent dead players from updating heading', () => {
      const initialHeading = player.heading
      
      player.die()
      expect(player.isAlive).toBe(false)
      
      // Try to update heading
      player.input.setMovement(5, 5)
      player.updateHeadingFromInput()
      
      // Heading should not change
      expect(player.heading).toBe(initialHeading)
    })
  })
})

