/**
 * Unit tests for mobDataMerger utility functions
 */

import { mergeMobData, createMergedMobs } from '../mobDataMerger'
import { MobInstance } from '../../../../utils/gameDataManager'

describe('mobDataMerger', () => {
  const mockMetadata: MobInstance = {
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

  describe('mergeMobData', () => {
    it('merges metadata with real-time gameState data', () => {
      const gameMob = {
        id: 'mob-1',
        currentHealth: 60, // Real-time update
        isAlive: true,
        currentBehavior: 'attack', // Real-time update
        tag: 'attack',
        isCasting: true, // Real-time update
        isAttacking: true // Real-time update
      }

      const result = mergeMobData(mockMetadata, gameMob)

      // Static fields from metadata
      expect(result.mobTypeId).toBe('spear_thrower')
      expect(result.maxHealth).toBe(100)
      expect(result.attackDamage).toBe(20)

      // Real-time fields from gameState
      expect(result.currentHealth).toBe(60)
      expect(result.currentBehavior).toBe('attack')
      expect(result.tag).toBe('attack')
      expect(result.isCasting).toBe(true)
      expect(result.isAttacking).toBe(true)
    })

    it('handles Colyseus schema objects with toJSON', () => {
      const gameMob = {
        id: 'mob-1',
        toJSON: () => ({
          id: 'mob-1',
          currentHealth: 50,
          isAlive: false,
          currentBehavior: 'dead'
        })
      }

      const result = mergeMobData(mockMetadata, gameMob)
      expect(result.currentHealth).toBe(50)
      expect(result.isAlive).toBe(false)
      expect(result.currentBehavior).toBe('dead')
    })

    it('falls back to metadata values when gameState fields are missing', () => {
      const gameMob = {
        id: 'mob-1'
      }

      const result = mergeMobData(mockMetadata, gameMob)
      expect(result.currentHealth).toBe(75) // From metadata
      expect(result.currentBehavior).toBe('chase') // From metadata
      expect(result.isCasting).toBe(false) // From metadata
    })
  })

  describe('createMergedMobs', () => {
    it('creates merged mobs array from gameState and metadata', () => {
      const gameStateMobs = new Map([
        ['mob-1', { id: 'mob-1', currentHealth: 60 } as any],
        ['mob-2', { id: 'mob-2', currentHealth: 80 } as any]
      ])

      const metadataMap = new Map([
        ['mob-1', mockMetadata],
        ['mob-2', { ...mockMetadata, id: 'mob-2' }]
      ])

      const result = createMergedMobs(gameStateMobs, metadataMap)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('mob-1')
      expect(result[0].currentHealth).toBe(60) // From gameState
      expect(result[1].id).toBe('mob-2')
      expect(result[1].currentHealth).toBe(80) // From gameState
    })

    it('uses gameState data when metadata is missing', () => {
      const gameStateMobs = new Map([
        ['mob-1', {
          id: 'mob-1',
          mobTypeId: 'unknown',
          radius: 5,
          maxHealth: 100,
          currentHealth: 60,
          isAlive: true,
          attackDamage: 20,
          attackRange: 10,
          attackDelay: 1000,
          defense: 5,
          armor: 2,
          density: 1,
          maxMoveSpeed: 20,
          currentBehavior: 'attack',
          tag: 'attack',
          behaviorLockedUntil: 0,
          isCasting: false,
          isAttacking: false,
          lastAttackedTarget: ''
        } as any]
      ])

      const metadataMap = new Map()

      const result = createMergedMobs(gameStateMobs, metadataMap)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('mob-1')
      expect(result[0].currentHealth).toBe(60)
    })

    it('returns empty array when gameState has no mobs', () => {
      const gameStateMobs = new Map()
      const metadataMap = new Map([['mob-1', mockMetadata]])

      const result = createMergedMobs(gameStateMobs, metadataMap)

      expect(result).toHaveLength(0)
    })
  })
})

