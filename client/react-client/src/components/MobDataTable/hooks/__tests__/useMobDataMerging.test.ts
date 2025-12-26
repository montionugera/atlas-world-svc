/**
 * Unit tests for useMobDataMerging hook
 */

import { renderHook } from '@testing-library/react'
import { useMobDataMerging } from '../useMobDataMerging'
import { GameState } from '../../../../types/game'
import { MobInstance } from '../../../../utils/gameDataManager'

describe('useMobDataMerging', () => {
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

  it('returns metadata only when gameState is null', () => {
    const metadataMap = new Map([['mob-1', mockMetadata]])

    const { result } = renderHook(() =>
      useMobDataMerging({ gameState: null, mobsMetadata: metadataMap })
    )

    expect(result.current.mergedMobs).toHaveLength(1)
    expect(result.current.mergedMobs[0]).toEqual(mockMetadata)
  })

  it('returns empty array when gameState has no mobs (empty Map)', () => {
    const gameState: GameState = {
      players: new Map(),
      mobs: new Map(), // Empty Map - createMergedMobs will return empty array
      tick: 0,
      mapId: 'map-01',
      width: 400,
      height: 300
    }

    const metadataMap = new Map([['mob-1', mockMetadata]])

    const { result } = renderHook(() =>
      useMobDataMerging({ gameState, mobsMetadata: metadataMap })
    )

    // When gameState.mobs exists but is empty, createMergedMobs returns empty array
    // This is correct behavior - we only show mobs that exist in gameState
    expect(result.current.mergedMobs).toHaveLength(0)
  })

  it('merges gameState mobs with metadata', () => {
    const gameState: GameState = {
      players: new Map(),
      mobs: new Map([
        ['mob-1', {
          id: 'mob-1',
          currentHealth: 60,
          isAlive: true,
          currentBehavior: 'attack',
          tag: 'attack',
          isCasting: true,
          isAttacking: true
        } as any]
      ]),
      tick: 0,
      mapId: 'map-01',
      width: 400,
      height: 300
    }

    const metadataMap = new Map([['mob-1', mockMetadata]])

    const { result } = renderHook(() =>
      useMobDataMerging({ gameState, mobsMetadata: metadataMap })
    )

    expect(result.current.mergedMobs).toHaveLength(1)
    expect(result.current.mergedMobs[0].mobTypeId).toBe('spear_thrower') // From metadata
    expect(result.current.mergedMobs[0].currentHealth).toBe(60) // From gameState
    expect(result.current.mergedMobs[0].currentBehavior).toBe('attack') // From gameState
  })

  it('uses gameState data when metadata is missing', () => {
    const gameState: GameState = {
      players: new Map(),
      mobs: new Map([
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
      ]),
      tick: 0,
      mapId: 'map-01',
      width: 400,
      height: 300
    }

    const metadataMap = new Map()

    const { result } = renderHook(() =>
      useMobDataMerging({ gameState, mobsMetadata: metadataMap })
    )

    expect(result.current.mergedMobs).toHaveLength(1)
    expect(result.current.mergedMobs[0].id).toBe('mob-1')
    expect(result.current.mergedMobs[0].currentHealth).toBe(60)
  })

  it('updates when gameState tick changes', () => {
    const gameState: GameState = {
      players: new Map(),
      mobs: new Map([
        ['mob-1', {
          id: 'mob-1',
          currentHealth: 60
        } as any]
      ]),
      tick: 0,
      mapId: 'map-01',
      width: 400,
      height: 300
    }

    const metadataMap = new Map([['mob-1', mockMetadata]])

    const { result, rerender } = renderHook(
      ({ gameState }) => useMobDataMerging({ gameState, mobsMetadata: metadataMap }),
      { initialProps: { gameState } }
    )

    expect(result.current.mergedMobs[0].currentHealth).toBe(60)

    // Update gameState with new tick and health
    const updatedGameState: GameState = {
      ...gameState,
      tick: 1,
      mobs: new Map([
        ['mob-1', {
          id: 'mob-1',
          currentHealth: 50
        } as any]
      ])
    }

    rerender({ gameState: updatedGameState })

    expect(result.current.mergedMobs[0].currentHealth).toBe(50)
  })

  it('handles multiple mobs', () => {
    const gameState: GameState = {
      players: new Map(),
      mobs: new Map([
        ['mob-1', { id: 'mob-1', currentHealth: 60 } as any],
        ['mob-2', { id: 'mob-2', currentHealth: 80 } as any]
      ]),
      tick: 0,
      mapId: 'map-01',
      width: 400,
      height: 300
    }

    const metadataMap = new Map([
      ['mob-1', mockMetadata],
      ['mob-2', { ...mockMetadata, id: 'mob-2' }]
    ])

    const { result } = renderHook(() =>
      useMobDataMerging({ gameState, mobsMetadata: metadataMap })
    )

    expect(result.current.mergedMobs).toHaveLength(2)
    expect(result.current.mergedMobs[0].id).toBe('mob-1')
    expect(result.current.mergedMobs[1].id).toBe('mob-2')
  })
})

