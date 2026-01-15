/**
 * Mob Lifecycle Manager Tests
 * Tests dead mob removal, respawn, and lifecycle management
 */

import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals'

// Define Mock Config FIRST before imports
const MOCK_MAP_CONFIG = {
  mobSpawnAreas: [
    { id: 'area-1', x: 0, y: 0, width: 100, height: 100, count: 5, spawnIntervalMs: 1000, mobType: 'test-mob' },
    { id: 'area-2', x: 200, y: 200, width: 100, height: 100, count: 3, spawnIntervalMs: 2000, mobType: 'test-mob' }
  ]
}

// Mock mapConfig
jest.mock('../config/mapConfig', () => ({
  MAP_CONFIG: MOCK_MAP_CONFIG
}))

// Mock mobTypesConfig to handle 'test-mob'
jest.mock('../config/mobTypesConfig', () => {
    // We need to return the original module for everything EXCEPT getMobTypeById
    const original = jest.requireActual('../config/mobTypesConfig') as any;
    return {
        ...original,
        getMobTypeById: jest.fn((id: string) => {
            if (id === 'test-mob') {
                return {
                    id: 'test-mob',
                    name: 'Test Mob',
                    hp: 100,
                    radius: 5,
                    stats: { maxHealth: 100 },
                    atkStrategies: []
                }
            }
            return original.getMobTypeById(id);
        }),
        calculateMobRadius: (config: any) => config.radius || 5
    }
})

import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { eventBus } from '../events/EventBus'
// Import the (now mocked) config to use in tests if needed (though we use MOCK_MAP_CONFIG directly)
import { MAP_CONFIG } from '../config/mapConfig'

describe('MobLifeCycleManager', () => {
  let gameState: GameState
  let lifecycleManager: MobLifeCycleManager
  const roomId = 'test-room'
  let mobRemoveListener: ((data: any) => void) | null = null

  // Helper to calculate total desired spawn count from mock config
  const getRandomTotalDesiredCount = () => {
    return (MOCK_MAP_CONFIG.mobSpawnAreas || []).reduce((sum, area) => sum + area.count, 0)
  }

  // Helper to force spawn readiness
  const forceSpawnReady = () => {
    const map = lifecycleManager['lastSpawnAtByArea'] as Map<string, number>
    for (const area of MOCK_MAP_CONFIG.mobSpawnAreas) {
        map.set(area.id, Date.now() - (area.spawnIntervalMs || 10000))
    }
  }

  // Helper to force spawn readiness in the past (to prevent spawn)
  const forceSpawnNotReady = () => {
      const map = lifecycleManager['lastSpawnAtByArea'] as Map<string, number>
      for (const area of MOCK_MAP_CONFIG.mobSpawnAreas) {
          map.set(area.id, Date.now() + 10000)
      }
  }

  beforeEach(() => {
    jest.useFakeTimers() // Use fake timers for stable timing tests
    gameState = new GameState('map-01-sector-a', roomId)
    lifecycleManager = new MobLifeCycleManager(roomId, gameState)
    // Clear event listeners between tests
    eventBus.removeAllListeners()
  })

  afterEach(() => {
    jest.useRealTimers()
    // Clean up any listeners added in tests
    if (mobRemoveListener) {
      eventBus.offRoomEvent(roomId, mobRemoveListener as any)
      mobRemoveListener = null
    }
    // Remove all listeners for this room
    eventBus.removeRoomListeners(roomId)
    gameState.stopAI()
    jest.clearAllMocks()
  })

  // ... rest of the file logic remains logic-compatible, but runs against MOCK config ...
  // Note: I am rewriting the file structure to support the mock, 
  // but I must include the rest of the tests otherwise they are deleted.
  // The ReplaceFileContent tool replaces a block. I will use the tool to replace the IMPORT and SETUP section
  // and keep the individual tests if possible, OR replace the whole file if the structure requires it.
  // Since `jest.mock` triggers hoisting, it's safer to rewrite the whole file or the top section carefully.
  // I will assume the previous tests are valid and paste them below the setup.
  
  // Actually, I'll paste the tests back in.

  describe('Dead Mob Removal', () => {
    test('should remove dead mobs from game state', () => {
      lifecycleManager['settings'].autoSpawn = false
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      gameState.aiModule.registerMob(mob, { behaviors: ['wander'], perception: { range: 50 } })

      expect(gameState.mobs.size).toBe(1)
      mob.die()
      mob.readyToRemove = true
      lifecycleManager.update()
      expect(gameState.mobs.size).toBe(0)
      lifecycleManager['settings'].autoSpawn = true
    })

    test('should emit MOB_REMOVED event when removing dead mobs', (done) => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      gameState.aiModule.registerMob(mob, { behaviors: ['wander'], perception: { range: 50 } })
      mob.die()
      mob.readyToRemove = true

      mobRemoveListener = (data: any) => {
        try {
          expect(data.mob.id).toBe('mob-1')
          expect(data.mob.isAlive).toBe(false)
          done()
        } catch (error) {
          done(error as Error)
        }
      }
      eventBus.onRoomEventMobRemove(roomId, mobRemoveListener)
      lifecycleManager.update()
    })

    test('should remove multiple dead mobs in single update', () => {
      lifecycleManager['settings'].autoSpawn = false
      for (let i = 0; i < 3; i++) {
        const mob = new Mob({ id: `mob-${i}`, x: 50 + i * 10, y: 50 })
        gameState.mobs.set(mob.id, mob)
        gameState.aiModule.registerMob(mob, { behaviors: ['wander'], perception: { range: 50 } })
        mob.die()
        mob.readyToRemove = true
      }
      expect(gameState.mobs.size).toBe(3)
      lifecycleManager.update()
      expect(gameState.mobs.size).toBe(0)
      lifecycleManager['settings'].autoSpawn = true
    })

    test('should only remove dead mobs, keep alive ones', () => {
      lifecycleManager['settings'].autoSpawn = false
      const aliveMob = new Mob({ id: 'mob-alive', x: 50, y: 50 })
      const deadMob = new Mob({ id: 'mob-dead', x: 60, y: 60 })
      deadMob.die()
      deadMob.readyToRemove = true

      gameState.mobs.set(aliveMob.id, aliveMob)
      gameState.mobs.set(deadMob.id, deadMob)
      gameState.aiModule.registerMob(aliveMob, { behaviors: ['wander'], perception: { range: 50 } })
      gameState.aiModule.registerMob(deadMob, { behaviors: ['wander'], perception: { range: 50 } })

      lifecycleManager.update()
      expect(gameState.mobs.size).toBe(1)
      expect(gameState.mobs.has('mob-alive')).toBe(true)
      expect(gameState.mobs.has('mob-dead')).toBe(false)
      lifecycleManager['settings'].autoSpawn = true
    })
  })

  describe('Alive Mob Counting', () => {
    test('should count total mobs (alive + dead) for spawn decisions', () => {
      const desiredCount = getRandomTotalDesiredCount() // Uses Mock (5+3=8)
      lifecycleManager.seedInitial()
      expect(gameState.mobs.size).toBe(desiredCount)

      const firstMob = Array.from(gameState.mobs.values())[0]
      firstMob.die()

      expect(gameState.mobs.size).toBe(desiredCount)
      const aliveMobs = Array.from(gameState.mobs.values()).filter(m => m.isAlive)
      expect(aliveMobs.length).toBe(desiredCount - 1)
      
      forceSpawnReady()
      lifecycleManager.update()
      expect(gameState.mobs.size).toBe(desiredCount) // Dead mob counts

      firstMob.readyToRemove = true
      lifecycleManager.update()
      
      const finalAliveMobs = Array.from(gameState.mobs.values()).filter(m => m.isAlive)
      expect(finalAliveMobs.length).toBe(desiredCount)
      expect(gameState.mobs.size).toBe(desiredCount)
    })

    test('should spawn new mobs when below desired count (after dead mobs removed)', () => {
      const desiredCount = getRandomTotalDesiredCount()
      lifecycleManager.seedInitial()
      
      for (const mob of gameState.mobs.values()) {
        mob.die()
        mob.readyToRemove = true
      }

      forceSpawnReady()
      lifecycleManager.update()

      const aliveMobs = Array.from(gameState.mobs.values()).filter(m => m.isAlive)
      expect(aliveMobs.length).toBeGreaterThan(0)
    })
  })

  describe('AI Integration', () => {
    test('dead mobs should not receive AI updates', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      gameState.aiModule.registerMob(mob, { behaviors: ['wander'], perception: { range: 50 } })

      mob.die()
      gameState.aiModule.updateAll()
      expect(mob.isAlive).toBe(false)
    })

    test('dead mobs should be unregistered from AI module', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      gameState.aiModule.registerMob(mob, { behaviors: ['wander'], perception: { range: 50 } })

      expect(gameState.aiModule['agents'].has(mob.id)).toBe(true)
      mob.die()
      mob.readyToRemove = true
      lifecycleManager.update()
      expect(gameState.aiModule['agents'].has(mob.id)).toBe(false)
    })
  })

  describe('Respawn Delay System', () => {
    test('should keep dead mobs until respawn delay expires', () => {
      lifecycleManager['settings'].autoSpawn = false
      lifecycleManager['settings'].respawnDelayMs = 100
      
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      gameState.aiModule.registerMob(mob, { behaviors: ['wander'], perception: { range: 50 } })
      
      mob.die()
      lifecycleManager.update()
      expect(gameState.mobs.size).toBe(1)
      
      // Advance timers and system time
      const now = Date.now()
      jest.setSystemTime(now + 150)
      jest.advanceTimersByTime(150)
      
      lifecycleManager.update()
      expect(gameState.mobs.size).toBe(0)
      lifecycleManager['settings'].autoSpawn = true
    })

    test('readyToRemove flag bypasses delay', () => {
      lifecycleManager['settings'].autoSpawn = false
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      mob.die()
      mob.readyToRemove = true
      lifecycleManager.update()
      expect(gameState.mobs.size).toBe(0)
      lifecycleManager['settings'].autoSpawn = true
    })

    test('readyToBeRemoved() checks delay correctly', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      expect(mob.readyToBeRemoved(15000)).toBe(false)
      mob.die()
      expect(mob.readyToBeRemoved(15000)).toBe(false)
      mob.readyToRemove = true
      expect(mob.readyToBeRemoved(15000)).toBe(true)
      
      mob.readyToRemove = false
      // readyToBeRemoved compares Date.now() - diedAt > delay
      // Since fake timers can be tricky with start time, we set diedAt explicitly
      const now = Date.now()
      mob.diedAt = now - 20000 
      
      expect(mob.readyToBeRemoved(15000)).toBe(true)
    })

    test('canRespawn() checks flags correctly', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      expect(mob.canRespawn()).toBe(false)
      mob.die()
      expect(mob.canRespawn()).toBe(true)
      mob.cantRespawn = true
      expect(mob.canRespawn()).toBe(false)
      mob.cantRespawn = false
      expect(mob.canRespawn()).toBe(true)
    })
  })

  describe('Respawn Logic', () => {
    test('should respawn mobs automatically after removal', () => {
      lifecycleManager.seedInitial()
      const initialCount = gameState.mobs.size
      // initialCount should be 8 based on MOCK config
      expect(initialCount).toBe(8)

      for (const mob of gameState.mobs.values()) {
        mob.die()
        mob.readyToRemove = true
      }

      forceSpawnReady()
      lifecycleManager.update()
      const aliveMobs = Array.from(gameState.mobs.values()).filter(m => m.isAlive)
      expect(aliveMobs.length).toBeGreaterThan(0)
    })

    test('should NOT spawn until dead mobs are removed', () => {
      lifecycleManager.seedInitial()
      const desiredCount = getRandomTotalDesiredCount() // 8
      
      const firstMob = Array.from(gameState.mobs.values())[0]
      const mobIdBeforeDeath = firstMob.id
      firstMob.die()
      
      const totalBeforeUpdate = gameState.mobs.size
      forceSpawnReady()
      lifecycleManager.update()
      
      const totalMobsAfterUpdate = gameState.mobs.size
      expect(gameState.mobs.has(mobIdBeforeDeath)).toBe(true)
      // No new spawn because dead mob counts
      expect(totalMobsAfterUpdate).toBe(totalBeforeUpdate)
      
      const mobToRemove = gameState.mobs.get(mobIdBeforeDeath)
      if (mobToRemove) mobToRemove.readyToRemove = true
      lifecycleManager.update()
      
      expect(gameState.mobs.has(mobIdBeforeDeath)).toBe(false)
      const totalAfterRemoval = gameState.mobs.size
      const aliveAfterRemoval = Array.from(gameState.mobs.values()).filter(m => m.isAlive).length
      expect(totalAfterRemoval).toBe(desiredCount)
      expect(aliveAfterRemoval).toBe(desiredCount)
    })

    test('should respect spawn interval', () => {
      lifecycleManager.seedInitial()
      const firstMob = Array.from(gameState.mobs.values())[0]
      firstMob.die()
      firstMob.readyToRemove = true
      lifecycleManager.update()

      const countAfterRemoval = Array.from(gameState.mobs.values()).filter(m => m.isAlive).length
      forceSpawnNotReady()
      lifecycleManager.update()

      const countAfterImmediateUpdate = Array.from(gameState.mobs.values()).filter(m => m.isAlive).length
      expect(countAfterImmediateUpdate).toBe(countAfterRemoval)

      forceSpawnReady()
      lifecycleManager.update()
      const finalCount = Array.from(gameState.mobs.values()).filter(m => m.isAlive).length
      expect(finalCount).toBeGreaterThan(countAfterRemoval)
    })
  })

  describe('Seed Initial', () => {
    test('should clear existing mobs and spawn desired count', () => {
      const oldMob = new Mob({ id: 'old-mob', x: 10, y: 10 })
      gameState.mobs.set(oldMob.id, oldMob)
      lifecycleManager.seedInitial()

      const desiredCount = getRandomTotalDesiredCount() // 8
      expect(gameState.mobs.has('old-mob')).toBe(false)
      expect(gameState.mobs.size).toBe(desiredCount)
    })

    test('should register spawned mobs with AI module', () => {
      lifecycleManager.seedInitial()
      for (const mob of gameState.mobs.values()) {
        expect(gameState.aiModule['agents'].has(mob.id)).toBe(true)
      }
    })
  })
})
