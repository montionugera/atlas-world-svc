/**
 * Unit tests for useEffectiveRoomId hook
 */

import { renderHook } from '@testing-library/react'
import { useEffectiveRoomId } from '../useEffectiveRoomId'
import { useGameStateContext } from '../../../../contexts/GameStateContext'
import { GameState } from '../../../../types/game'

jest.mock('../../../../contexts/GameStateContext')

const mockUseGameStateContext = useGameStateContext as jest.MockedFunction<typeof useGameStateContext>

describe('useEffectiveRoomId', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseGameStateContext.mockReturnValue({
      gameState: null,
      roomId: null,
      isConnected: false,
      setGameState: jest.fn()
    })
  })

  it('returns roomId from props when provided', () => {
    const { result } = renderHook(() =>
      useEffectiveRoomId({ roomId: 'prop-room-id', gameState: null })
    )
    expect(result.current.effectiveRoomId).toBe('prop-room-id')
  })

  it('returns roomId from context when prop is null', () => {
    mockUseGameStateContext.mockReturnValue({
      gameState: null,
      roomId: 'context-room-id',
      isConnected: true,
      setGameState: jest.fn()
    })

    const { result } = renderHook(() =>
      useEffectiveRoomId({ roomId: null, gameState: null })
    )
    expect(result.current.effectiveRoomId).toBe('context-room-id')
  })

  it('returns roomId from gameState when prop and context are null', () => {
    const gameState: GameState = {
      players: new Map(),
      mobs: new Map(),
      tick: 0,
      mapId: 'map-01',
      roomId: 'game-state-room-id',
      width: 400,
      height: 300
    }

    mockUseGameStateContext.mockReturnValue({
      gameState,
      roomId: null,
      isConnected: true,
      setGameState: jest.fn()
    })

    const { result } = renderHook(() =>
      useEffectiveRoomId({ roomId: null, gameState })
    )
    expect(result.current.effectiveRoomId).toBe('game-state-room-id')
  })

  it('prioritizes props over context and gameState', () => {
    const gameState: GameState = {
      players: new Map(),
      mobs: new Map(),
      tick: 0,
      mapId: 'map-01',
      roomId: 'game-state-room-id',
      width: 400,
      height: 300
    }

    mockUseGameStateContext.mockReturnValue({
      gameState,
      roomId: 'context-room-id',
      isConnected: true,
      setGameState: jest.fn()
    })

    const { result } = renderHook(() =>
      useEffectiveRoomId({ roomId: 'prop-room-id', gameState })
    )
    expect(result.current.effectiveRoomId).toBe('prop-room-id')
  })

  it('returns null when no roomId is available', () => {
    mockUseGameStateContext.mockReturnValue({
      gameState: null,
      roomId: null,
      isConnected: false,
      setGameState: jest.fn()
    })

    const { result } = renderHook(() =>
      useEffectiveRoomId({ roomId: null, gameState: null })
    )
    expect(result.current.effectiveRoomId).toBeNull()
  })

  it('uses gameState prop over context gameState', () => {
    const propGameState: GameState = {
      players: new Map(),
      mobs: new Map(),
      tick: 0,
      mapId: 'map-01',
      roomId: 'prop-game-state-room-id',
      width: 400,
      height: 300
    }

    const contextGameState: GameState = {
      players: new Map(),
      mobs: new Map(),
      tick: 0,
      mapId: 'map-01',
      roomId: 'context-game-state-room-id',
      width: 400,
      height: 300
    }

    mockUseGameStateContext.mockReturnValue({
      gameState: contextGameState,
      roomId: null,
      isConnected: true,
      setGameState: jest.fn()
    })

    const { result } = renderHook(() =>
      useEffectiveRoomId({ roomId: null, gameState: propGameState })
    )
    expect(result.current.effectiveRoomId).toBe('prop-game-state-room-id')
  })
})

