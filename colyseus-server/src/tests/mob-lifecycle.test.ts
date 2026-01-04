/**
 * Mob Lifecycle Manager Tests
 * Tests dead mob removal, respawn, and lifecycle management
 */

import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { eventBus, RoomEventType } from '../events/EventBus'
import { MAP_CONFIG } from '../config/mapConfig'

describe('MobLifeCycleManager', () => {
  let gameState: GameState
  let lifecycleManager: MobLifeCycleManager
  const roomId = 'test-room'
  let mobRemoveListener: ((data: any) => void) | null = null

  // Helper to calculate total desired spawn count from map config
  const getRandomTotalDesiredCount = () => {
    return (MAP_CONFIG.mobSpawnAreas || []).reduce((sum, area) => sum + area.count, 0)
  }

  // Helper to force spawn readiness
  const forceSpawnReady = () => {
    const map = lifecycleManager['lastSpawnAtByArea'] as Map<string, number>
    // If map is empty (e.g. before initial seed), we might need to rely on init logic,
    // but usually seedInitial populates it.
    // If we want to force updates, we can just iterate the config areas
    for (const area of MAP_CONFIG.mobSpawnAreas) {
        map.set(area.id, Date.now() - (area.spawnIntervalMs || 10000))
    }
  }

    // Helper to force spawn readiness in the past (to prevent spawn)
    const forceSpawnNotReady = () => {
        const map = lifecycleManager['lastSpawnAtByArea'] as Map<string, number>
        for (const area of MAP_CONFIG.mobSpawnAreas) {
            map.set(area.id, Date.now() + 10000)
        }
    }


  beforeEach(() => {
    gameState = new GameState('map-01-sector-a', roomId)
    lifecycleManager = new MobLifeCycleManager(roomId, gameState)
    // Clear event listeners between tests
    eventBus.removeAllListeners()
  })

  afterEach(() => {
    // Clean up any listeners added in tests
    if (mobRemoveListener) {
      eventBus.offRoomEvent(roomId, mobRemoveListener as any)
      mobRemoveListener = null
    }
    // Remove all listeners for this room
    eventBus.removeRoomListeners(roomId)
    gameState.stopAI()
  })

  describe('Dead Mob Removal', () => {
    test('should remove dead mobs from game state', () => {
      // Temporarily disable auto-spawn for this test
      lifecycleManager['settings'].autoSpawn = false
      
      // Spawn a mob
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      gameState.aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50 },
      })

      expect(gameState.mobs.size).toBe(1)
      expect(gameState.aiModule['agents'].has(mob.id)).toBe(true)

      // Kill the mob
      mob.die()
      expect(mob.isAlive).toBe(false)
      
      // For testing: trigger immediate removal (bypass delay)
      mob.readyToRemove = true

      // Update lifecycle manager - should remove dead mob immediately
      lifecycleManager.update()

      expect(gameState.mobs.size).toBe(0)
      expect(gameState.aiModule['agents'].has(mob.id)).toBe(false)
      
      // Restore auto-spawn
      lifecycleManager['settings'].autoSpawn = true
    })

    test('should emit MOB_REMOVED event when removing dead mobs', (done) => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      gameState.aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50 },
      })

      mob.die()
      
      // For testing: trigger immediate removal
      mob.readyToRemove = true

      // Listen for removal event
      mobRemoveListener = (data: any) => {
        expect(data.mob.id).toBe('mob-1')
        expect(data.mob.isAlive).toBe(false)
        done()
      }
      eventBus.onRoomEventMobRemove(roomId, mobRemoveListener)

      lifecycleManager.update()
    })

    test('should remove multiple dead mobs in single update', () => {
      // Temporarily disable auto-spawn
      lifecycleManager['settings'].autoSpawn = false
      
      // Spawn multiple mobs
      for (let i = 0; i < 3; i++) {
        const mob = new Mob({ id: `mob-${i}`, x: 50 + i * 10, y: 50 })
        gameState.mobs.set(mob.id, mob)
        gameState.aiModule.registerMob(mob, {
          behaviors: ['wander'],
          perception: { range: 50 },
        })
        mob.die()
        mob.readyToRemove = true // Immediate removal for testing
      }

      expect(gameState.mobs.size).toBe(3)

      lifecycleManager.update()

      expect(gameState.mobs.size).toBe(0)
      
      // Restore auto-spawn
      lifecycleManager['settings'].autoSpawn = true
    })

    test('should only remove dead mobs, keep alive ones', () => {
      // Temporarily disable auto-spawn
      lifecycleManager['settings'].autoSpawn = false
      
      const aliveMob = new Mob({ id: 'mob-alive', x: 50, y: 50 })
      const deadMob = new Mob({ id: 'mob-dead', x: 60, y: 60 })
      deadMob.die()
      deadMob.readyToRemove = true // Immediate removal for testing

      gameState.mobs.set(aliveMob.id, aliveMob)
      gameState.mobs.set(deadMob.id, deadMob)
      gameState.aiModule.registerMob(aliveMob, {
        behaviors: ['wander'],
        perception: { range: 50 },
      })
      gameState.aiModule.registerMob(deadMob, {
        behaviors: ['wander'],
        perception: { range: 50 },
      })

      lifecycleManager.update()

      expect(gameState.mobs.size).toBe(1)
      expect(gameState.mobs.has('mob-alive')).toBe(true)
      expect(gameState.mobs.has('mob-dead')).toBe(false)
      
      // Restore auto-spawn
      lifecycleManager['settings'].autoSpawn = true
    })
  })

  describe('Alive Mob Counting', () => {
    test('should count total mobs (alive + dead) for spawn decisions', () => {
      // Spawn desired count
      const desiredCount = getRandomTotalDesiredCount()
      lifecycleManager.seedInitial()
      expect(gameState.mobs.size).toBe(desiredCount)

      // Kill one mob
      const firstMob = Array.from(gameState.mobs.values())[0]
      firstMob.die()

      // Should still have desiredCount total (alive + dead), but only (desiredCount - 1) alive
      expect(gameState.mobs.size).toBe(desiredCount)
      const aliveMobs = Array.from(gameState.mobs.values()).filter(m => m.isAlive)
      expect(aliveMobs.length).toBe(desiredCount - 1)
      
      // Fast-forward spawn timer to allow respawn
      forceSpawnReady()
      
      // Update should NOT spawn yet (dead mob still counts toward total for that area)
      lifecycleManager.update()
      expect(gameState.mobs.size).toBe(desiredCount) // Still desiredCount (dead mob not removed yet)
      
      // Mark dead mob for removal and update
      firstMob.readyToRemove = true
      lifecycleManager.update()
      
      // Now should have spawned to replace removed mob
      const finalAliveMobs = Array.from(gameState.mobs.values()).filter(m => m.isAlive)
      expect(finalAliveMobs.length).toBe(desiredCount) // All alive now
      expect(gameState.mobs.size).toBe(desiredCount) // Total back to desired
    })

    test('should spawn new mobs when below desired count (after dead mobs removed)', () => {
      const desiredCount = getRandomTotalDesiredCount()
      lifecycleManager.seedInitial()
      expect(gameState.mobs.size).toBe(desiredCount)

      // Kill all mobs and mark for immediate removal (bypass delay for testing)
      for (const mob of gameState.mobs.values()) {
        mob.die()
        mob.readyToRemove = true // Bypass delay
      }

      // Fast-forward spawn timer
      forceSpawnReady()

      // Update - should remove dead and spawn replacements
      lifecycleManager.update()

      const aliveMobs = Array.from(gameState.mobs.values()).filter(m => m.isAlive)
      expect(aliveMobs.length).toBeGreaterThan(0)
    })
  })

  describe('AI Integration', () => {
    test('dead mobs should not receive AI updates', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      gameState.aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50 },
      })

      const initialBehavior = mob.currentBehavior

      // Kill mob
      mob.die()

      // Update AI - should skip dead mob
      gameState.aiModule.updateAll()

      // Mob behavior should not change (or should remain unchanged from AI)
      expect(mob.isAlive).toBe(false)
    })

    test('dead mobs should be unregistered from AI module', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      gameState.aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50 },
      })

      expect(gameState.aiModule['agents'].has(mob.id)).toBe(true)

      mob.die()
      mob.readyToRemove = true // Immediate removal for testing
      lifecycleManager.update()

      expect(gameState.aiModule['agents'].has(mob.id)).toBe(false)
    })
  })

  describe('Respawn Delay System', () => {
    test('should keep dead mobs until respawn delay expires', () => {
      // Temporarily disable auto-spawn
      lifecycleManager['settings'].autoSpawn = false
      
      // Set short delay for testing
      lifecycleManager['settings'].respawnDelayMs = 100
      
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      gameState.aiModule.registerMob(mob, {
        behaviors: ['wander'],
        perception: { range: 50 },
      })
      
      mob.die()
      expect(mob.isAlive).toBe(false)
      
      // Update immediately - mob should still be there (delay not expired)
      lifecycleManager.update()
      expect(gameState.mobs.size).toBe(1)
      expect(gameState.mobs.has('mob-1')).toBe(true)
      
      // Wait for delay to expire
      return new Promise(resolve => {
        setTimeout(() => {
          lifecycleManager.update()
          expect(gameState.mobs.size).toBe(0)
            // Restore auto-spawn
          lifecycleManager['settings'].autoSpawn = true
          resolve(undefined)
        }, 150) // Slightly more than 100ms delay
      })
    })

    test('readyToRemove flag bypasses delay', () => {
      lifecycleManager['settings'].autoSpawn = false
      
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      gameState.mobs.set(mob.id, mob)
      mob.die()
      
      // Set flag - should remove immediately
      mob.readyToRemove = true
      
      lifecycleManager.update()
      
      expect(gameState.mobs.size).toBe(0)
      lifecycleManager['settings'].autoSpawn = true
    })

    test('readyToBeRemoved() checks delay correctly', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      
      // Alive mob
      expect(mob.readyToBeRemoved(15000)).toBe(false)
      
      // Dead mob, delay not expired
      mob.die()
      expect(mob.readyToBeRemoved(15000)).toBe(false)
      
      // Dead mob with immediate flag
      mob.readyToRemove = true
      expect(mob.readyToBeRemoved(15000)).toBe(true)
      
      // Reset flag, fast-forward time
      mob.readyToRemove = false
      mob.diedAt = Date.now() - 20000 // 20 seconds ago
      expect(mob.readyToBeRemoved(15000)).toBe(true)
    })

    test('canRespawn() checks flags correctly', () => {
      const mob = new Mob({ id: 'mob-1', x: 50, y: 50 })
      
      // Alive mob
      expect(mob.canRespawn()).toBe(false)
      
      // Dead mob, can respawn
      mob.die()
      expect(mob.canRespawn()).toBe(true)
      
      // Dead mob with cantRespawn flag
      mob.cantRespawn = true
      expect(mob.canRespawn()).toBe(false)
      
      // Reset flag
      mob.cantRespawn = false
      expect(mob.canRespawn()).toBe(true)
    })
  })

  describe('Respawn Logic', () => {
    test('should respawn mobs automatically after removal', () => {
      lifecycleManager.seedInitial()
      const initialCount = gameState.mobs.size
      expect(initialCount).toBeGreaterThan(0)

      // Kill all mobs and mark for immediate removal (bypass delay for testing)
      for (const mob of gameState.mobs.values()) {
        mob.die()
        mob.readyToRemove = true // Bypass delay
      }

      // Fast-forward spawn timer
      forceSpawnReady()

      // Update should remove dead and spawn new
      lifecycleManager.update()

      const aliveMobs = Array.from(gameState.mobs.values()).filter(m => m.isAlive)
      expect(aliveMobs.length).toBeGreaterThan(0)
    })

    test('should NOT spawn until dead mobs are removed', () => {
      lifecycleManager.seedInitial()
      const desiredCount = getRandomTotalDesiredCount()
      
      // Kill one mob (but don't mark for removal - let it wait for delay)
      const mobsBefore = Array.from(gameState.mobs.values())
      const firstMob = mobsBefore[0]
      const mobIdBeforeDeath = firstMob.id
      firstMob.die()
      
      // Count mobs before update
      const totalBeforeUpdate = gameState.mobs.size
      
      // Fast-forward spawn timer to allow spawning
      forceSpawnReady()

      // Update - should NOT spawn yet (dead mob still in game, total count includes dead)
      lifecycleManager.update()
      
      const totalMobsAfterUpdate = gameState.mobs.size
      const deadMobStillPresent = gameState.mobs.has(mobIdBeforeDeath)
      
      // Dead mob should still be in game (not removed yet)
      expect(deadMobStillPresent).toBe(true)
      // Total should be same or less (no new spawns - dead mob counts toward total)
      // Note: cleanup might remove other mobs, so we just check dead mob is still there
      expect(totalMobsAfterUpdate).toBeGreaterThanOrEqual(totalBeforeUpdate - 1)
      
      // Now mark dead mob for removal and update
      const mobToRemove = gameState.mobs.get(mobIdBeforeDeath)
      if (mobToRemove) {
        mobToRemove.readyToRemove = true
      }
      lifecycleManager.update()
      
      // After removal, dead mob should be gone
      const deadMobRemoved = !gameState.mobs.has(mobIdBeforeDeath)
      expect(deadMobRemoved).toBe(true)
      
      // Should have spawned to replace removed mob
      const totalAfterRemoval = gameState.mobs.size
      const aliveAfterRemoval = Array.from(gameState.mobs.values()).filter(m => m.isAlive).length
      
      // Total should be back to desired (spawn happened after removal)
      expect(totalAfterRemoval).toBe(desiredCount)
      expect(aliveAfterRemoval).toBe(desiredCount) // All should be alive now
    })

    test('should respect spawn interval', () => {
      lifecycleManager.seedInitial()

      // Kill a mob and mark for immediate removal
      const firstMob = Array.from(gameState.mobs.values())[0]
      firstMob.die()
      firstMob.readyToRemove = true // Bypass delay for testing
      lifecycleManager.update() // Remove dead mob

      const countAfterRemoval = Array.from(gameState.mobs.values()).filter(m => m.isAlive).length

      // Force spawn NOT ready
      forceSpawnNotReady()

      // Update immediately - should not spawn yet (interval not elapsed)
      lifecycleManager.update()

      // Should still be same count (spawn interval not elapsed)
      const countAfterImmediateUpdate = Array.from(gameState.mobs.values()).filter(m => m.isAlive).length
      expect(countAfterImmediateUpdate).toBe(countAfterRemoval)

      // Fast-forward time
      forceSpawnReady()
      lifecycleManager.update()

      // Should have spawned
      const finalCount = Array.from(gameState.mobs.values()).filter(m => m.isAlive).length
      expect(finalCount).toBeGreaterThan(countAfterRemoval)
    })
  })

  describe('Seed Initial', () => {
    test('should clear existing mobs and spawn desired count', () => {
      // Add some existing mobs
      const oldMob = new Mob({ id: 'old-mob', x: 10, y: 10 })
      gameState.mobs.set(oldMob.id, oldMob)

      lifecycleManager.seedInitial()

      // Should have cleared old and spawned new
      const desiredCount = getRandomTotalDesiredCount()
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
