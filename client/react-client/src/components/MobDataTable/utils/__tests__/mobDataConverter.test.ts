/**
 * Unit tests for mobDataConverter utility functions
 */

import { mobFromGameState, extractMobData } from '../mobDataConverter'

describe('mobDataConverter', () => {
  describe('extractMobData', () => {
    it('extracts data from plain object', () => {
      const mob = { id: 'mob-1', x: 10, y: 20 }
      expect(extractMobData(mob)).toEqual({ id: 'mob-1', x: 10, y: 20 })
    })

    it('extracts data from Colyseus schema object with toJSON', () => {
      const mob = {
        id: 'mob-1',
        x: 10,
        toJSON: () => ({ id: 'mob-1', x: 10, y: 20 })
      }
      expect(extractMobData(mob)).toEqual({ id: 'mob-1', x: 10, y: 20 })
    })
  })

  describe('mobFromGameState', () => {
    it('converts plain mob object to MobInstance', () => {
      const mob = {
        id: 'mob-1',
        mobTypeId: 'spear_thrower',
        radius: 5,
        maxHealth: 100,
        currentHealth: 75,
        isAlive: true,
        attackDamage: 20,
        attackRange: 10,
        attackDelay: 1000,
        defense: 5,
        armor: 2,
        density: 1,
        maxMoveSpeed: 20,
        currentBehavior: 'chase',
        tag: 'chase',
        behaviorLockedUntil: 0,
        isCasting: false,
        isAttacking: false,
        lastAttackedTarget: ''
      }

      const result = mobFromGameState(mob)
      expect(result).toEqual(mob)
    })

    it('handles Colyseus schema object with toJSON', () => {
      const mob = {
        id: 'mob-1',
        mobTypeId: 'spear_thrower',
        toJSON: () => ({
          id: 'mob-1',
          mobTypeId: 'spear_thrower',
          radius: 5,
          maxHealth: 100,
          currentHealth: 75,
          isAlive: true,
          attackDamage: 20,
          attackRange: 10,
          attackDelay: 1000,
          defense: 5,
          armor: 2,
          density: 1,
          maxMoveSpeed: 20,
          currentBehavior: 'chase',
          tag: 'chase',
          behaviorLockedUntil: 0,
          isCasting: false,
          isAttacking: false,
          lastAttackedTarget: ''
        })
      }

      const result = mobFromGameState(mob)
      expect(result.id).toBe('mob-1')
      expect(result.mobTypeId).toBe('spear_thrower')
      expect(result.radius).toBe(5)
    })

    it('provides default values for missing fields', () => {
      const mob = {
        id: 'mob-1'
      }

      const result = mobFromGameState(mob)
      expect(result.id).toBe('mob-1')
      expect(result.mobTypeId).toBe('unknown')
      expect(result.radius).toBe(0)
      expect(result.maxHealth).toBe(0)
      expect(result.currentHealth).toBe(0)
      expect(result.isAlive).toBe(true)
      expect(result.currentBehavior).toBe('idle')
      expect(result.tag).toBe('')
    })

    it('handles null/undefined values with nullish coalescing', () => {
      const mob = {
        id: 'mob-1',
        radius: 0, // Should preserve 0
        maxHealth: null as any,
        currentHealth: undefined as any
      }

      const result = mobFromGameState(mob)
      expect(result.radius).toBe(0)
      expect(result.maxHealth).toBe(0)
      expect(result.currentHealth).toBe(0)
    })
  })
})

