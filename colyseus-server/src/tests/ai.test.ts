/**
 * AI System Tests
 * Test the AI behaviors and decision making
 */

import { WanderBehavior } from '../ai/behaviors/WanderBehavior'
import { IdleBehavior } from '../ai/behaviors/IdleBehavior'
import { BoundaryAwareBehavior } from '../ai/behaviors/BoundaryAwareBehavior'
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { AIContext } from '../ai/core/AIContext'
import { AIState } from '../ai/core/AIState'

describe('AI Behavior Tests', () => {
  let testMob: Mob
  let testContext: AIContext

  beforeEach(() => {
    testMob = new Mob({ id: 'test-mob', x: 50, y: 50, vx: 0, vy: 0 })
    testContext = {
      gameState: {} as any,
      physicsManager: null,
      selfMob: testMob,
      nearbyPlayers: [],
      nearbyMobs: [],
      threats: [],
      worldBounds: { width: 100, height: 100 },
      currentState: AIState.IDLE,
      memory: {
        lastSeenPlayer: undefined,
        knownThreats: new Map(),
        behaviorHistory: [],
      },
    }
  })

  describe('Wander Behavior', () => {
    test('should execute wander behavior', () => {
      const wanderBehavior = new WanderBehavior()

      expect(wanderBehavior.canExecute(testContext)).toBe(true)

      const decision = wanderBehavior.execute(testMob, testContext)

      expect(decision).toBeDefined()
      expect(decision.behavior).toBe('wander')
      expect(decision.velocity).toBeDefined()
      expect(typeof decision.velocity.x).toBe('number')
      expect(typeof decision.velocity.y).toBe('number')
    })

    test('should generate wander targets', () => {
      const wanderBehavior = new WanderBehavior()

      // Execute multiple times to test target generation
      for (let i = 0; i < 5; i++) {
        const decision = wanderBehavior.execute(testMob, testContext)
        expect(decision.velocity).toBeDefined()
      }
    })
  })

  describe('Idle Behavior', () => {
    test('should execute idle behavior when no players nearby', () => {
      const idleBehavior = new IdleBehavior()

      expect(idleBehavior.canExecute(testContext)).toBe(true)

      const decision = idleBehavior.execute(testMob, testContext)

      expect(decision).toBeDefined()
      expect(decision.behavior).toBe('idle')
      expect(decision.velocity).toBeDefined()
    })

    test('should not execute when players are nearby', () => {
      const idleBehavior = new IdleBehavior()

      // Add nearby player
      const testPlayer = new Player('s1', 'Test Player')
      testPlayer.x = 55
      testPlayer.y = 55
      testContext.nearbyPlayers = [testPlayer]

      expect(idleBehavior.canExecute(testContext)).toBe(false)
    })
  })

  describe('Boundary Aware Behavior', () => {
    test('should execute when near boundaries', () => {
      const boundaryBehavior = new BoundaryAwareBehavior()

      // Position mob near left boundary
      testMob.x = 5
      testMob.y = 50

      const decision = boundaryBehavior.execute(testMob, testContext)

      expect(decision).toBeDefined()
      expect(decision.behavior).toBe('boundaryAware')
      expect(decision.velocity).toBeDefined()

      // Should have positive X velocity (moving away from left boundary)
      expect(decision.velocity.x).toBeGreaterThan(0)
    })

    test('should avoid right boundary', () => {
      const boundaryBehavior = new BoundaryAwareBehavior()

      // Position mob near right boundary
      testMob.x = 95
      testMob.y = 50

      const decision = boundaryBehavior.execute(testMob, testContext)

      expect(decision).toBeDefined()
      expect(decision.behavior).toBe('boundaryAware')

      // Should have negative X velocity (moving away from right boundary)
      expect(decision.velocity.x).toBeLessThan(0)
    })

    test('should avoid top boundary', () => {
      const boundaryBehavior = new BoundaryAwareBehavior()

      // Position mob near top boundary
      testMob.x = 50
      testMob.y = 5

      const decision = boundaryBehavior.execute(testMob, testContext)

      expect(decision).toBeDefined()
      expect(decision.behavior).toBe('boundaryAware')

      // Should have positive Y velocity (moving away from top boundary)
      expect(decision.velocity.y).toBeGreaterThan(0)
    })

    test('should avoid bottom boundary', () => {
      const boundaryBehavior = new BoundaryAwareBehavior()

      // Position mob near bottom boundary
      testMob.x = 50
      testMob.y = 95

      const decision = boundaryBehavior.execute(testMob, testContext)

      expect(decision).toBeDefined()
      expect(decision.behavior).toBe('boundaryAware')

      // Should have negative Y velocity (moving away from bottom boundary)
      expect(decision.velocity.y).toBeLessThan(0)
    })
  })

  describe('Behavior Priority', () => {
    test('should respect behavior priorities', () => {
      const wanderBehavior = new WanderBehavior()
      const idleBehavior = new IdleBehavior()
      const boundaryBehavior = new BoundaryAwareBehavior()

      expect(boundaryBehavior.priority).toBeGreaterThan(wanderBehavior.priority)
      expect(wanderBehavior.priority).toBeGreaterThan(idleBehavior.priority)
    })
  })
})
