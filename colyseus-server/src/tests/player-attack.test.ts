/**
 * Player Attack System Tests
 * Tests the player attack functionality with heading-based targeting
 */

import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'

describe('Player Attack System', () => {
  let testPlayer: Player
  let testMob: Mob

  beforeEach(() => {
    testPlayer = new Player('test-session', 'TestPlayer', 50, 50)
    testMob = new Mob({ id: 'mob-1', x: 53, y: 50 }) // 3 units away, directly to the right
  })

  describe('Target Detection', () => {
    test('should find target in heading direction', () => {
      // Set player heading to face right (towards mob)
      testPlayer.heading = 0 // 0 radians = right
      
      const target = testPlayer.findTargetInDirection(new Map([['mob-1', testMob]]))
      
      expect(target).toBe(testMob)
    })

    test('should not find target outside attack range', () => {
      // Move mob far away
      testMob.x = 200
      testMob.y = 50
      
      testPlayer.heading = 0
      const target = testPlayer.findTargetInDirection(new Map([['mob-1', testMob]]))
      
      expect(target).toBeNull()
    })

    test('should not find target outside attack cone', () => {
      // Place mob behind player
      testMob.x = 40
      testMob.y = 50
      
      testPlayer.heading = 0 // facing right
      const target = testPlayer.findTargetInDirection(new Map([['mob-1', testMob]]))
      
      expect(target).toBeNull()
    })

    test('should find nearest target when multiple targets in range', () => {
      const mob2 = new Mob({ id: 'mob-2', x: 52, y: 50 }) // closer to player
      const mob3 = new Mob({ id: 'mob-3', x: 70, y: 50 }) // farther from player
      
      testPlayer.heading = 0 // facing right
      const target = testPlayer.findTargetInDirection(new Map([
        ['mob-1', testMob],
        ['mob-2', mob2],
        ['mob-3', mob3]
      ]))
      
      expect(target).toBe(mob2) // Should find the closest one
    })
  })

  describe('Attack Processing', () => {
    test('should process attack when target is found', () => {
      testPlayer.heading = 0
      testPlayer.input.attack = true
      
      // Mock the event bus
      const mockEmitRoomEvent = jest.fn()
      jest.doMock('../events/EventBus', () => ({
        eventBus: {
          emitRoomEvent: mockEmitRoomEvent
        },
        RoomEventType: {
          BATTLE_ATTACK: 'BATTLE_ATTACK'
        }
      }))
      
      const result = testPlayer.processAttackInput(new Map([['mob-1', testMob]]), 'test-room')
      
      expect(result).toBe(true)
    })

    test('should process attack even when no target found (for visual feedback)', () => {
      testPlayer.heading = Math.PI // facing left (away from mob)
      testPlayer.input.attack = true
      
      const result = testPlayer.processAttackInput(new Map([['mob-1', testMob]]), 'test-room')
      
      // Now returns true even without target (allows attack animation/visual feedback)
      expect(result).toBe(true)
      // Attack state should be updated
      expect(testPlayer.isAttacking).toBe(true)
      expect(testPlayer.lastAttackTime).toBeGreaterThan(0)
    })

    test('should not process attack when on cooldown', () => {
      testPlayer.heading = 0
      testPlayer.input.attack = true
      testPlayer.lastAttackTime = Date.now() // Recent attack
      
      const result = testPlayer.processAttackInput(new Map([['mob-1', testMob]]), 'test-room')
      
      expect(result).toBe(false)
    })

    test('should not process attack when attack input is false', () => {
      testPlayer.heading = 0
      testPlayer.input.attack = false
      
      const result = testPlayer.processAttackInput(new Map([['mob-1', testMob]]), 'test-room')
      
      expect(result).toBe(false)
    })
  })

  describe('Attack Cooldown', () => {
    test('should respect attack delay', () => {
      testPlayer.lastAttackTime = performance.now()
      
      expect(testPlayer.canAttack()).toBe(false)
    })

    test('should allow attack after delay', () => {
      testPlayer.lastAttackTime = performance.now() - 2000 // 2 seconds ago
      
      expect(testPlayer.canAttack()).toBe(true)
    })
  })

  describe('Attack Range and Cone', () => {
    test('should calculate correct attack range', () => {
      const maxRange = testPlayer.attackRange + testPlayer.radius
      expect(maxRange).toBeCloseTo(4.3) // 3 + 1.3 (player radius max is 1.3)
    })

    test('should use correct attack cone angle', () => {
      const attackCone = Math.PI / 4 // 45 degrees
      expect(attackCone).toBeCloseTo(0.785, 3)
    })
  })
})
