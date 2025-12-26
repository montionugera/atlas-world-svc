/**
 * Boundary Avoidance Tests
 * Test that mobs intelligently avoid boundaries instead of bouncing off them
 */

import { Mob } from '../schemas/Mob'
import { GameState } from '../schemas/GameState'
import { AIModule } from '../ai/AIModule'
import { Player } from '../schemas/Player'
import { AvoidBoundaryBehavior } from '../ai/behaviors/AgentBehaviors'

describe('Boundary Avoidance Tests', () => {
  let gameState: GameState
  let testMob: Mob
  let aiModule: AIModule

  beforeEach(() => {
    gameState = new GameState()
    testMob = new Mob({
      id: 'test-mob',
      x: 10, // Near left boundary
      y: 150,
      vx: 0,
      vy: 0,
    })

    gameState.mobs.set(testMob.id, testMob)
    aiModule = gameState.aiModule
    aiModule.registerMob(testMob, {})
  })

  describe('Boundary Detection', () => {
    test('should detect when mob is near left boundary', () => {
      testMob.x = 15 // Within 30px threshold

      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 400, height: 300 },
      }

      const decision = aiModule.decideBehavior(testMob, env)
      testMob.applyBehaviorDecision(decision)

      expect(testMob.currentBehavior).toBe('avoidBoundary')
    })

    test('should detect when mob is near right boundary', () => {
      testMob.x = 385 // Within 30px of right boundary (400-30=370)

      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 400, height: 300 },
      }

      const decision = aiModule.decideBehavior(testMob, env)
      testMob.applyBehaviorDecision(decision)

      expect(testMob.currentBehavior).toBe('avoidBoundary')
    })

    test('should detect when mob is near top boundary', () => {
      testMob.y = 15 // Within 30px of top boundary

      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 400, height: 300 },
      }

      const decision = aiModule.decideBehavior(testMob, env)
      testMob.applyBehaviorDecision(decision)

      expect(testMob.currentBehavior).toBe('avoidBoundary')
    })

    test('should detect when mob is near bottom boundary', () => {
      testMob.y = 285 // Within 30px of bottom boundary (300-30=270)

      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 400, height: 300 },
      }

      const decision = aiModule.decideBehavior(testMob, env)
      testMob.applyBehaviorDecision(decision)

      expect(testMob.currentBehavior).toBe('avoidBoundary')
    })

    test('should not trigger boundary avoidance when far from boundaries', () => {
      testMob.x = 200 // Center of world
      testMob.y = 150

      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        nearBoundary: false,
        worldBounds: { width: 800, height: 600 },
      }

      const decision = aiModule.decideBehavior(testMob, env)
      testMob.applyBehaviorDecision(decision)

      expect(testMob.currentBehavior).toBe('wander')
    })
  })

  describe('Boundary Avoidance Movement', () => {
    test('should move away from left boundary', () => {
      testMob.x = 10 // Very close to left boundary
      const behavior = new AvoidBoundaryBehavior()
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 400, height: 300 },
      }

      const decision = behavior.getDecision(testMob, env, Date.now())
      const velocity = decision.desiredVelocity || { x: 0, y: 0 }

      // Should move right (positive X)
      expect(velocity.x).toBeGreaterThan(0)
      expect(velocity.y).toBeCloseTo(0, 1) // Should be mostly horizontal
    })

    test('should move away from right boundary', () => {
      testMob.x = 390 // Very close to right boundary
      const behavior = new AvoidBoundaryBehavior()
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 400, height: 300 },
      }

      const decision = behavior.getDecision(testMob, env, Date.now())
      const velocity = decision.desiredVelocity || { x: 0, y: 0 }

      // Should move left (negative X)
      expect(velocity.x).toBeLessThan(0)
      expect(velocity.y).toBeCloseTo(0, 1) // Should be mostly horizontal
    })

    test('should move away from top boundary', () => {
      testMob.x = 200 // Center horizontally to avoid left/right boundary effects
      testMob.y = 10 // Very close to top boundary
      const behavior = new AvoidBoundaryBehavior()
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 400, height: 300 },
      }

      const decision = behavior.getDecision(testMob, env, Date.now())
      const velocity = decision.desiredVelocity || { x: 0, y: 0 }

      // Should move down (positive Y)
      expect(velocity.y).toBeGreaterThan(0)
      expect(velocity.x).toBeCloseTo(0, 1) // Should be mostly vertical
    })

    test('should move away from bottom boundary', () => {
      testMob.x = 200 // Center horizontally to avoid left/right boundary effects
      testMob.y = 290 // Very close to bottom boundary
      const behavior = new AvoidBoundaryBehavior()
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 400, height: 300 },
      }

      const decision = behavior.getDecision(testMob, env, Date.now())
      const velocity = decision.desiredVelocity || { x: 0, y: 0 }

      // Should move up (negative Y)
      expect(velocity.y).toBeLessThan(0)
      expect(velocity.x).toBeCloseTo(0, 1) // Should be mostly vertical
    })

    test('should move toward center when in corner', () => {
      testMob.x = 5 // Very close to left boundary
      testMob.y = 5 // Very close to top boundary
      const behavior = new AvoidBoundaryBehavior()
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 400, height: 300 },
      }

      const decision = behavior.getDecision(testMob, env, Date.now())
      const velocity = decision.desiredVelocity || { x: 0, y: 0 }

      // Should move toward center (positive X and Y)
      expect(velocity.x).toBeGreaterThan(0)
      expect(velocity.y).toBeGreaterThan(0)
    })
  })

  describe('Behavior Priority', () => {
    test('boundary avoidance should have higher priority than attack', () => {
      testMob.x = 10 // Near boundary

      // Create a test player
      const testPlayer = new Player('player1', 'TestPlayer', 15, 150)
      gameState.players.set('player1', testPlayer)

      // Use AIWorldInterface to build proper environment
      const env = gameState.worldInterface.buildMobEnvironment(testMob, 50)
      // Override nearBoundary for test
      env.nearBoundary = true

      const decision = aiModule.decideBehavior(testMob, env)
      testMob.applyBehaviorDecision(decision)

      // Should choose boundary avoidance over attack
      expect(testMob.currentBehavior).toBe('avoidBoundary')
    })

    test('boundary avoidance should have higher priority than chase', () => {
      testMob.x = 10 // Near boundary

      // Create a test player
      const testPlayer2 = new Player('player2', 'TestPlayer', 20, 150)
      gameState.players.set('player2', testPlayer2)

      // Use AIWorldInterface to build proper environment
      const env = gameState.worldInterface.buildMobEnvironment(testMob, 50)
      // Override nearBoundary for test
      env.nearBoundary = true

      const decision = aiModule.decideBehavior(testMob, env)
      testMob.applyBehaviorDecision(decision)

      // Should choose boundary avoidance over chase
      expect(testMob.currentBehavior).toBe('avoidBoundary')
    })

    test('should return to normal behavior when away from boundary', () => {
      testMob.x = 200 // Center of world
      testMob.y = 150

      // Create a test player (close enough for chase)
      const testPlayer = new Player('test-session', 'TestPlayer', 215, 150)
      gameState.players.set('test-session', testPlayer)

      // Use AIWorldInterface to build proper environment
      const env = gameState.worldInterface.buildMobEnvironment(testMob, 50)
      // Ensure not near boundary
      env.nearBoundary = false

      const decision = aiModule.decideBehavior(testMob, env)
      testMob.applyBehaviorDecision(decision)

      // Should choose chase (normal behavior)
      expect(testMob.currentBehavior).toBe('chase')
    })
  })

  describe('Edge Cases', () => {
    test('should handle mob at exact boundary', () => {
      testMob.x = 0 // Exactly at left boundary
      const behavior = new AvoidBoundaryBehavior()
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 400, height: 300 },
      }

      const decision = behavior.getDecision(testMob, env, Date.now())
      const velocity = decision.desiredVelocity || { x: 0, y: 0 }

      // Should have strong rightward movement
      expect(velocity.x).toBeGreaterThan(10)
    })

    test('should handle mob at world center', () => {
      testMob.x = 200 // Center
      testMob.y = 150
      const behavior = new AvoidBoundaryBehavior()
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true, // Force behavior to run
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 400, height: 300 },
      }

      const decision = behavior.getDecision(testMob, env, Date.now())
      const velocity = decision.desiredVelocity || { x: 0, y: 0 }

      // Should move toward center (no movement needed)
      expect(velocity.x).toBeCloseTo(0, 1)
      expect(velocity.y).toBeCloseTo(0, 1)
    })

    test('should handle very small world bounds', () => {
      testMob.x = 5
      testMob.y = 5
      const behavior = new AvoidBoundaryBehavior()
      const env = {
        nearestPlayer: null,
        distanceToNearestPlayer: Infinity,
        nearBoundary: true,
        nearestMob: null,
        distanceToNearestMob: Infinity,
        worldBounds: { width: 20, height: 20 },
      }

      const decision = behavior.getDecision(testMob, env, Date.now())
      const velocity = decision.desiredVelocity || { x: 0, y: 0 }

      // Should still work with small bounds
      expect(velocity.x).toBeGreaterThan(0)
      expect(velocity.y).toBeGreaterThan(0)
    })
  })
})
