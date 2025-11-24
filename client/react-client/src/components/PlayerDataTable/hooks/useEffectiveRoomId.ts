/**
 * Determine effective room ID from props or context
 * Reuses logic from MobDataTable
 */

import { useGameStateContext } from '../../../contexts/GameStateContext'
import { GameState } from '../../../types/game'
import { UseEffectiveRoomIdReturn } from '../types'

interface UseEffectiveRoomIdProps {
  roomId: string | null
  gameState?: GameState | null
}

/**
 * Get effective room ID from props or context
 * Priority: props.roomId > context.roomId > gameState (if available)
 */
export function useEffectiveRoomId({
  roomId,
  gameState
}: UseEffectiveRoomIdProps): UseEffectiveRoomIdReturn {
  const context = useGameStateContext()
  
  // Priority: props > context > gameState
  const effectiveRoomId = roomId || context.roomId || (gameState ? 'current-room' : null)
  
  return { effectiveRoomId }
}

