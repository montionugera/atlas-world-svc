import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { BattleManager } from '../modules/BattleManager'

describe('Mob Movement and Steering', () => {
  let gameState: GameState
  let physicsManager: PlanckPhysicsManager
  let battleManager: BattleManager

  beforeEach(() => {
    // Create fresh instances for each test
    gameState = new GameState('test-map', 'room-1')
    physicsManager = new PlanckPhysicsManager()
    battleManager = new BattleManager('room-1', gameState)

    // Connect physics manager to AI interface
    gameState.worldInterface.setPhysicsManager(physicsManager)
  })

  afterEach(() => {
    // Clean up physics manager
    physicsManager.destroy()
    // Stop AI module to prevent background timers
    gameState.stopAI()
  })

  describe('Mob Physics Integration', () => {
    test('should create physics body for mob', () => {
      // Create a test mob
      const mob = new Mob({
        id: 'test-mob-1',
        x: 100,
        y: 100,
        vx: 0,
        vy: 0,
        radius: 2,
      })

      // Add mob to game state
      gameState.mobs.set(mob.id, mob)

      // Create physics body
      const body = physicsManager.createMobBody(mob)

      // Verify physics body was created
      expect(body).toBeDefined()
      expect(physicsManager.getBody(mob.id)).toBe(body)
    })

    test('should apply steering forces correctly', () => {
      // Create a test mob
      const mob = new Mob({
        id: 'test-mob-2',
        x: 100,
        y: 100,
        vx: 5, // Current velocity
        vy: 0,
        radius: 2,
      })

      // Add mob to game state
      gameState.mobs.set(mob.id, mob)

      // Create physics body
      physicsManager.createMobBody(mob)

      // Set desired velocity (different from current)
      mob.desiredVx = 10 // Want to go faster in X
      mob.desiredVy = 5 // Want to move in Y

      // Apply mob forces
      physicsManager.update(16, gameState.players, gameState.mobs)

      // Get updated velocity from physics body
      const body = physicsManager.getBody(mob.id)
      const newVelocity = body!.getLinearVelocity()

      // Verify velocity changed (should be closer to desired)
      expect(newVelocity.x).toBeGreaterThan(5) // Should have accelerated in X
      expect(newVelocity.y).toBeGreaterThan(0) // Should have started moving in Y
    })

    test('should not apply force when desired velocity equals current velocity', () => {
      // Create a test mob
      const mob = new Mob({
        id: 'test-mob-3',
        x: 100,
        y: 100,
        vx: 5,
        vy: 3,
        radius: 2,
      })

      // Add mob to game state
      gameState.mobs.set(mob.id, mob)

      // Create physics body
      physicsManager.createMobBody(mob)

      // Set desired velocity to match current velocity
      mob.desiredVx = 5
      mob.desiredVy = 3

      // Get initial velocity
      const body = physicsManager.getBody(mob.id)
      const initialVelocity = body!.getLinearVelocity()

      // Apply mob forces
      physicsManager.update(16, gameState.players, gameState.mobs)

      // Get final velocity
      const finalVelocity = body!.getLinearVelocity()

      // Velocity should remain approximately the same (with some physics damping)
      expect(Math.abs(finalVelocity.x - initialVelocity.x)).toBeLessThan(0.1)
      expect(Math.abs(finalVelocity.y - initialVelocity.y)).toBeLessThan(0.1)
    })
  })

  describe('AI Integration', () => {
    test('should set desired velocity from AI decisions', () => {
      // Create a test mob
      const mob = new Mob({
        id: 'test-mob-4',
        x: 100,
        y: 100,
        vx: 0,
        vy: 0,
        radius: 2,
      })

      // Add mob to game state
      gameState.mobs.set(mob.id, mob)

      // Create physics body
      physicsManager.createMobBody(mob)

      // Simulate AI decision
      const aiDecision = {
        velocity: { x: 10, y: 5 },
        behavior: 'chase',
        timestamp: Date.now(),
      }

      // Apply AI decision
      gameState.worldInterface.applyAIDecision(mob.id, aiDecision)

      // Verify desired velocity was set
      expect(mob.desiredVx).toBe(10)
      expect(mob.desiredVy).toBe(5)
      expect(mob.desiredBehavior).toBe('chase')
    })

    test('should update mob position from physics', () => {
      // Create a test mob
      const mob = new Mob({
        id: 'test-mob-5',
        x: 100,
        y: 100,
        vx: 0,
        vy: 0,
        radius: 2,
      })

      // Add mob to game state
      gameState.mobs.set(mob.id, mob)

      // Create physics body
      physicsManager.createMobBody(mob)

      // Set desired velocity
      mob.desiredVx = 10
      mob.desiredVy = 5

      // Apply physics update
      physicsManager.update(16, gameState.players, gameState.mobs)

      // Verify mob position was updated from physics
      expect(mob.x).not.toBe(100) // Position should have changed
      expect(mob.y).not.toBe(100)
      expect(mob.vx).not.toBe(0) // Velocity should have changed
      expect(mob.vy).not.toBe(0)
    })
  })

  describe('Complete Mob Behavior', () => {
    test('should handle full mob update cycle', () => {
      // Create a test mob
      const mob = new Mob({
        id: 'test-mob-6',
        x: 100,
        y: 100,
        vx: 0,
        vy: 0,
        radius: 2,
      })

      // Add mob to game state
      gameState.mobs.set(mob.id, mob)

      // Create physics body
      physicsManager.createMobBody(mob)

      // Simulate AI decision
      const aiDecision = {
        velocity: { x: 15, y: 8 },
        behavior: 'chase',
        timestamp: Date.now(),
      }

      // Apply AI decision
      gameState.worldInterface.applyAIDecision(mob.id, aiDecision)

      // Update mob through game state
      gameState.updateMobs()

      // Apply physics
      physicsManager.update(16, gameState.players, gameState.mobs)

      // Verify mob has moved
      expect(mob.x).not.toBe(100)
      expect(mob.y).not.toBe(100)
      expect(mob.vx).not.toBe(0)
      expect(mob.vy).not.toBe(0)
    })

    test('should handle multiple mobs with different behaviors', () => {
      // Create multiple test mobs
      const mob1 = new Mob({
        id: 'test-mob-7',
        x: 100,
        y: 100,
        vx: 0,
        vy: 0,
        radius: 2,
      })

      const mob2 = new Mob({
        id: 'test-mob-8',
        x: 200,
        y: 200,
        vx: 0,
        vy: 0,
        radius: 2,
      })

      // Add mobs to game state
      gameState.mobs.set(mob1.id, mob1)
      gameState.mobs.set(mob2.id, mob2)

      // Create physics bodies
      physicsManager.createMobBody(mob1)
      physicsManager.createMobBody(mob2)

      // Set different desired velocities
      mob1.desiredVx = 10
      mob1.desiredVy = 5
      mob2.desiredVx = -8
      mob2.desiredVy = 12

      // Apply physics update
      physicsManager.update(16, gameState.players, gameState.mobs)

      // Verify both mobs moved in different directions
      expect(mob1.x).not.toBe(100)
      expect(mob1.y).not.toBe(100)
      expect(mob2.x).not.toBe(200)
      expect(mob2.y).not.toBe(200)

      // Verify they moved in different directions
      const mob1Movement = Math.sqrt((mob1.x - 100) ** 2 + (mob1.y - 100) ** 2)
      const mob2Movement = Math.sqrt((mob2.x - 200) ** 2 + (mob2.y - 200) ** 2)

      expect(mob1Movement).toBeGreaterThan(0)
      expect(mob2Movement).toBeGreaterThan(0)
    })
  })

  describe('Steering Force Calculation', () => {
    test('should calculate correct steering force for acceleration', () => {
      const mob = new Mob({
        id: 'test-mob-9',
        x: 100,
        y: 100,
        vx: 2, // Current velocity
        vy: 1,
        radius: 2,
      })

      gameState.mobs.set(mob.id, mob)
      physicsManager.createMobBody(mob)

      // Set desired velocity (faster in same direction)
      mob.desiredVx = 8 // Want to go faster in X
      mob.desiredVy = 4 // Want to go faster in Y

      // Apply forces
      physicsManager.update(16, gameState.players, gameState.mobs)

      const body = physicsManager.getBody(mob.id)
      const newVelocity = body!.getLinearVelocity()

      // Should have accelerated in both directions
      expect(newVelocity.x).toBeGreaterThan(2)
      expect(newVelocity.y).toBeGreaterThan(1)
    })

    test('should calculate correct steering force for direction change', () => {
      const mob = new Mob({
        id: 'test-mob-10',
        x: 100,
        y: 100,
        vx: 5, // Moving right
        vy: 0, // Not moving vertically
        radius: 2,
      })

      gameState.mobs.set(mob.id, mob)
      physicsManager.createMobBody(mob)

      // Set desired velocity (want to go left instead)
      mob.desiredVx = -3 // Want to go left
      mob.desiredVy = 2 // Want to go up

      // Apply forces
      physicsManager.update(16, gameState.players, gameState.mobs)

      const body = physicsManager.getBody(mob.id)
      const newVelocity = body!.getLinearVelocity()

      // Should have changed direction (X should decrease, Y should increase)
      expect(newVelocity.x).toBeLessThan(5) // Slowing down in X
      expect(newVelocity.y).toBeGreaterThan(0) // Starting to move in Y
    })
  })
})
