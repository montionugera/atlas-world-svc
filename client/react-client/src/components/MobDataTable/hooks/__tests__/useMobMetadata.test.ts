/**
 * Unit tests for useMobMetadata hook
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { useMobMetadata } from '../useMobMetadata'
import { gameDataManager } from '../../../../utils/gameDataManager'
import { MobInstance } from '../../../../utils/gameDataManager'

jest.mock('../../../../utils/gameDataManager')

const mockGameDataManager = gameDataManager as jest.Mocked<typeof gameDataManager>

describe('useMobMetadata', () => {
  const mockMob: MobInstance = {
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

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('initializes with empty metadata map and starts loading', async () => {
    mockGameDataManager.getRoomMobs.mockResolvedValue([])

    const { result } = renderHook(() =>
      useMobMetadata({ effectiveRoomId: 'room-123', refreshInterval: 0 })
    )

    // Initially loading because useEffect runs immediately
    expect(result.current.loading).toBe(true)
    expect(result.current.mobsMetadata.size).toBe(0)
    expect(result.current.error).toBeNull()

    // Wait for fetch to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it('fetches metadata on mount when roomId is provided', async () => {
    mockGameDataManager.getRoomMobs.mockResolvedValue([mockMob])

    const { result } = renderHook(() =>
      useMobMetadata({ effectiveRoomId: 'room-123', refreshInterval: 0 })
    )

    await waitFor(() => {
      expect(mockGameDataManager.getRoomMobs).toHaveBeenCalledWith('room-123', true)
    })

    await waitFor(() => {
      expect(result.current.mobsMetadata.size).toBe(1)
      expect(result.current.mobsMetadata.get('mob-1')).toEqual(mockMob)
    })
  })

  it('does not fetch when roomId is null', () => {
    mockGameDataManager.getRoomMobs.mockResolvedValue([mockMob])

    renderHook(() =>
      useMobMetadata({ effectiveRoomId: null, refreshInterval: 0 })
    )

    expect(mockGameDataManager.getRoomMobs).not.toHaveBeenCalled()
  })

  it('sets loading state during fetch', async () => {
    let resolvePromise: (value: MobInstance[]) => void
    const promise = new Promise<MobInstance[]>((resolve) => {
      resolvePromise = resolve
    })

    mockGameDataManager.getRoomMobs.mockReturnValue(promise)

    const { result } = renderHook(() =>
      useMobMetadata({ effectiveRoomId: 'room-123', refreshInterval: 0 })
    )

    // Should be loading initially
    expect(result.current.loading).toBe(true)

    // Resolve the promise
    act(() => {
      resolvePromise!([mockMob])
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it('handles fetch errors', async () => {
    const error = new Error('Failed to fetch')
    mockGameDataManager.getRoomMobs.mockRejectedValue(error)

    const { result } = renderHook(() =>
      useMobMetadata({ effectiveRoomId: 'room-123', refreshInterval: 0 })
    )

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to fetch')
      expect(result.current.loading).toBe(false)
    })
  })

  it('fetches metadata for specific mob IDs', async () => {
    mockGameDataManager.getRoomMobs.mockResolvedValue([mockMob])

    const { result } = renderHook(() =>
      useMobMetadata({ effectiveRoomId: 'room-123', refreshInterval: 0 })
    )

    await waitFor(() => {
      expect(result.current.mobsMetadata.size).toBe(1)
    })

    // Fetch specific mobs
    await act(async () => {
      await result.current.fetchMobsMetadata(['mob-2'])
    })

    // Should have been called with roomId
    expect(mockGameDataManager.getRoomMobs).toHaveBeenCalled()
  })

  it('updates metadata map when fetching', async () => {
    mockGameDataManager.getRoomMobs.mockResolvedValue([mockMob])

    const { result } = renderHook(() =>
      useMobMetadata({ effectiveRoomId: 'room-123', refreshInterval: 0 })
    )

    await waitFor(() => {
      expect(result.current.mobsMetadata.size).toBe(1)
    })

    const newMob = { ...mockMob, id: 'mob-2' }
    mockGameDataManager.getRoomMobs.mockResolvedValue([mockMob, newMob])

    await act(async () => {
      await result.current.fetchMobsMetadata()
    })

    await waitFor(() => {
      expect(result.current.mobsMetadata.size).toBe(2)
      expect(result.current.mobsMetadata.get('mob-2')).toEqual(newMob)
    })
  })

  it('sets up polling when refreshInterval is provided', async () => {
    mockGameDataManager.getRoomMobs.mockResolvedValue([mockMob])

    renderHook(() =>
      useMobMetadata({ effectiveRoomId: 'room-123', refreshInterval: 1000 })
    )

    await waitFor(() => {
      expect(mockGameDataManager.getRoomMobs).toHaveBeenCalledTimes(1)
    })

    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(1000)
    })

    await waitFor(() => {
      expect(mockGameDataManager.getRoomMobs.mock.calls.length).toBeGreaterThan(1)
    })
  })

  it('clears metadata when roomId becomes null', async () => {
    mockGameDataManager.getRoomMobs.mockResolvedValue([mockMob])

    const { result, rerender } = renderHook(
      ({ roomId }) => useMobMetadata({ effectiveRoomId: roomId, refreshInterval: 0 }),
      { initialProps: { roomId: 'room-123' as string | null } }
    )

    await waitFor(() => {
      expect(result.current.mobsMetadata.size).toBe(1)
    })

    // Change roomId to null
    rerender({ roomId: null })

    await waitFor(() => {
      expect(result.current.mobsMetadata.size).toBe(0)
    })
  })

  it('provides refreshMetadata function', async () => {
    mockGameDataManager.getRoomMobs.mockResolvedValue([mockMob])

    const { result } = renderHook(() =>
      useMobMetadata({ effectiveRoomId: 'room-123', refreshInterval: 0 })
    )

    await waitFor(() => {
      expect(result.current.mobsMetadata.size).toBe(1)
    })

    const initialCallCount = mockGameDataManager.getRoomMobs.mock.calls.length

    await act(async () => {
      result.current.refreshMetadata()
    })

    await waitFor(() => {
      expect(mockGameDataManager.getRoomMobs.mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })
})

