/**
 * Test Utilities
 * Common helpers for writing tests
 */

import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { MOB_STATS } from '../config/combatConfig'
import { PLAYER_STATS } from '../config/combatConfig'

/**
 * Create a test GameState with default settings
 */
export function createTestGameState(
  mapId: string = 'test-map',
  roomId: string = 'test-room'
): GameState {
  return new GameState(mapId, roomId)
}

/**
 * Create a test Mob with default values
 */
export function createTestMob(options: {
  id?: string
  x?: number
  y?: number
  vx?: number
  vy?: number
} = {}): Mob {
  const {
    id = `test-mob-${Date.now()}`,
    x = 50,
    y = 50,
    vx = 0,
    vy = 0,
  } = options

  return new Mob({
    id,
    x,
    y,
    vx,
    vy,
    radius: MOB_STATS.radius,
    maxHealth: MOB_STATS.maxHealth,
    attackDamage: MOB_STATS.attackDamage,
    attackRange: MOB_STATS.attackRange,
    attackDelay: MOB_STATS.attackDelay,
  })
}

/**
 * Create a test Player with default values
 */
export function createTestPlayer(options: {
  sessionId?: string
  name?: string
  x?: number
  y?: number
} = {}): Player {
  const {
    sessionId = `test-session-${Date.now()}`,
    name = 'TestPlayer',
    x = 100,
    y = 100,
  } = options

  return new Player(sessionId, name, x, y)
}

/**
 * Wait for a condition to become true
 * @param condition Function that returns true when condition is met
 * @param timeoutMs Maximum time to wait (default: 5000ms)
 * @param intervalMs Check interval (default: 50ms)
 */
export function waitForCondition(
  condition: () => boolean,
  timeoutMs: number = 5000,
  intervalMs: number = 50
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const check = () => {
      if (condition()) {
        resolve()
      } else if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Condition not met within ${timeoutMs}ms`))
      } else {
        setTimeout(check, intervalMs)
      }
    }
    check()
  })
}

/**
 * Fast-forward time for testing
 * Simulates time passage by updating timestamps
 */
export function fastForwardTime(
  entity: { lastAttackTime?: number; diedAt?: number; behaviorLockedUntil?: number },
  ms: number
): void {
  const now = performance.now()
  const dateNow = Date.now()

  if (entity.lastAttackTime !== undefined) {
    entity.lastAttackTime = now - ms
  }
  if (entity.diedAt !== undefined && entity.diedAt > 0) {
    entity.diedAt = dateNow - ms
  }
  if (entity.behaviorLockedUntil !== undefined) {
    entity.behaviorLockedUntil = dateNow - ms
  }
}

/**
 * Create multiple test mobs
 */
export function createTestMobs(count: number, options: {
  x?: number
  y?: number
  spacing?: number
} = {}): Mob[] {
  const { x = 50, y = 50, spacing = 20 } = options
  const mobs: Mob[] = []

  for (let i = 0; i < count; i++) {
    mobs.push(
      createTestMob({
        id: `test-mob-${i}`,
        x: x + i * spacing,
        y: y + i * spacing,
      })
    )
  }

  return mobs
}

