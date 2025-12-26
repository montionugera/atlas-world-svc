import { useMemo } from 'react'
import { GameState } from '../../../types/game'
import { useGameStateContext } from '../../../contexts/GameStateContext'
import { UseEffectiveRoomIdReturn } from '../types'

interface UseEffectiveRoomIdProps {
  roomId: string | null
  gameState?: GameState | null
}

/**
 * Resolve roomId from props, context, or gameState
 * Provides fallback logic for determining the effective room ID
 * 
 * @param roomId - Room ID from props
 * @param gameState - Optional gameState prop
 * @returns Effective room ID from multiple sources
 */
export function useEffectiveRoomId({
  roomId,
  gameState: gameStateProp
}: UseEffectiveRoomIdProps): UseEffectiveRoomIdReturn {
  const contextState = useGameStateContext()
  const gameState = gameStateProp || contextState.gameState
  const contextRoomId = contextState.roomId

  const effectiveRoomId = useMemo(() => {
    return roomId || contextRoomId || gameState?.roomId || null
  }, [roomId, contextRoomId, gameState?.roomId])

  return { effectiveRoomId }
}

