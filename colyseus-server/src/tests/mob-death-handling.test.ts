/**
 * Mob Death Handling Tests
 * Tests that dead mobs don't move, don't receive AI updates, and are handled correctly
 */

import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { MobAIModule } from '../ai/MobAIModule'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { GAME_CONFIG } from '../config/gameConfig'

describe('Mob Death Handling', () => {
  let gameState: GameState
  let aiModule: MobAIModule
  let physicsManager: PlanckPhysicsManager

  beforeEach(() => {
    gameState = new GameState('test-map', 'test-room')
    aiModule = gameState.aiModule
    physicsManager = new PlanckPhysicsManager()
    gameState.worldInterface.setPhysicsManager(physicsManager)
  })

  afterEach(() => {
    gameState.stopAI()
    physicsManager.destroy()
  })

  describe('AI Module', () => {
    test('should skip dead mobs in AI updates', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50 },
      })

      const initialDesiredVx = mob.desiredVx
      const initialDesiredVy = mob.desiredVy

      // Kill mob
      mob.die()
      expect(mob.isAlive).toBe(false)

      // Update AI - should skip dead mob
      aiModule.updateAll()

      // Desired velocity should not change (dead mobs are skipped)
      expect(mob.desiredVx).toBe(initialDesiredVx)
      expect(mob.desiredVy).toBe(initialDesiredVy)
    })

    test('should process alive mobs but skip dead ones', () => {
      const aliveMob = new Mob({ id: 'mob-alive', x: 50, y: 50 })
      const deadMob = new Mob({ id: 'mob-dead', x: 60, y: 60 })
      deadMob.die()

      gameState.mobs.set(aliveMob.id, aliveMob)
      gameState.mobs.set(deadMob.id, deadMob)
      aiModule.registerMob(aliveMob, {
        behaviors: ['wander'],
        perception: { range: 50 },
      })
      aiModule.registerMob(deadMob, {
        behaviors: ['wander'],
        perception: { range: 50 },
      })

      // AI update should process alive mob but not dead one
      aiModule.updateAll()

      // Alive mob should have AI decision applied
      expect(aliveMob.isAlive).toBe(true)
      // Dead mob should remain unchanged
      expect(deadMob.isAlive).toBe(false)
    })
  })

  describe('GameState Update', () => {
    test('should skip dead mobs in updateMobs', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)

      const initialX = mob.x
      const initialY = mob.y

      mob.die()

      // Update mobs - should skip dead
      gameState.updateMobs()

      // Position should not change (dead mobs are skipped)
      expect(mob.x).toBe(initialX)
      expect(mob.y).toBe(initialY)
    })

    test('should update alive mobs but skip dead ones', () => {
      const aliveMob = new Mob({ id: 'mob-alive', x: 50, y: 50 })
      const deadMob = new Mob({ id: 'mob-dead', x: 60, y: 60 })
      deadMob.die()

      gameState.mobs.set(aliveMob.id, aliveMob)
      gameState.mobs.set(deadMob.id, deadMob)

      const deadMobX = deadMob.x
      const deadMobY = deadMob.y

      gameState.updateMobs()

      // Dead mob position should not change
      expect(deadMob.x).toBe(deadMobX)
      expect(deadMob.y).toBe(deadMobY)
    })
  })

  describe('Physics Manager', () => {
    test('should stop dead mobs from moving', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50, vx: 5, vy: 5 })
      gameState.mobs.set(mob.id, mob)
      physicsManager.createMobBody(mob)

      const body = physicsManager.getBody(mob.id)
      expect(body).toBeDefined()

      if (body) {
        // Set some velocity
        body.setLinearVelocity(require('planck').Vec2(10, 10))

        // Kill mob
        mob.die()

        // Process mob steering - should stop dead mob
        physicsManager.update(GAME_CONFIG.tickRate, new Map(), gameState.mobs)

        // Velocity should be zeroed
        const velocity = body.getLinearVelocity()
        expect(velocity.x).toBe(0)
        expect(velocity.y).toBe(0)
      }
    })

    test('should apply forces to alive mobs but not dead ones', () => {
      const aliveMob = new Mob({ id: 'mob-alive', x: 50, y: 50 })
      const deadMob = new Mob({ id: 'mob-dead', x: 60, y: 60 })
      deadMob.die()

      gameState.mobs.set(aliveMob.id, aliveMob)
      gameState.mobs.set(deadMob.id, deadMob)

      physicsManager.createMobBody(aliveMob)
      physicsManager.createMobBody(deadMob)

      // Set desired velocity for both
      aliveMob.desiredVx = 5
      aliveMob.desiredVy = 5
      deadMob.desiredVx = 10
      deadMob.desiredVy = 10

      // Update physics
      physicsManager.update(GAME_CONFIG.tickRate, new Map(), gameState.mobs)

      const aliveBody = physicsManager.getBody(aliveMob.id)
      const deadBody = physicsManager.getBody(deadMob.id)

      if (aliveBody && deadBody) {
        const aliveVel = aliveBody.getLinearVelocity()
        const deadVel = deadBody.getLinearVelocity()

        // Alive mob should have velocity
        expect(Math.abs(aliveVel.x) + Math.abs(aliveVel.y)).toBeGreaterThan(0)
        // Dead mob should be stopped
        expect(deadVel.x).toBe(0)
        expect(deadVel.y).toBe(0)
      }
    })
  })

  describe('Death State', () => {
    test('die() should set isAlive to false and zero velocity', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50, vx: 10, vy: 10 })
      expect(mob.isAlive).toBe(true)

      mob.die()

      expect(mob.isAlive).toBe(false)
      expect(mob.currentHealth).toBe(0)
      expect(mob.vx).toBe(0)
      expect(mob.vy).toBe(0)
      expect(mob.isAttacking).toBe(false)
      expect(mob.isMoving).toBe(false)
    })

    test('dead mobs cannot attack', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      // Reset cooldown - set to past to ensure attack is ready
      mob.lastAttackTime = performance.now() - mob.attackDelay - 100

      // Mob should be able to attack when alive
      expect(mob.isAlive).toBe(true)
      expect(mob.canAttack()).toBe(true)

      // Kill mob
      mob.die()

      // Dead mob cannot attack
      expect(mob.canAttack()).toBe(false)
    })
  })
})

