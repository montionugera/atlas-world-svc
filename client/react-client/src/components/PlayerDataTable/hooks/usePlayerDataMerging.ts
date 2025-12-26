import { useMemo } from 'react'
import { GameState } from '../../../types/game'
import { PlayerInstance } from '../../../utils/gameDataManager'
import { UsePlayerDataMergingReturn } from '../types'
import { mergePlayerData } from '../utils/playerDataMerger'

interface UsePlayerDataMergingProps {
  gameState?: GameState | null
  playersMetadata: Map<string, PlayerInstance>
  updateCount?: number
}

/**
 * Merge player metadata (REST API) with gameState data (WebSocket)
 * @param gameState - GameState from WebSocket
 * @param playersMetadata - Map of player metadata from REST API
 * @param updateCount - Tick count to force update
 * @returns Merged player instances array
 */
export function usePlayerDataMerging({
  gameState,
  playersMetadata,
  updateCount
}: UsePlayerDataMergingProps): UsePlayerDataMergingReturn {
  const mergedPlayers = useMemo(() => {
    console.log('[usePlayerDataMerging] Recalculating, updateCount:', updateCount)
    return mergePlayerData(gameState, playersMetadata)
  }, [gameState, playersMetadata, updateCount])

  return { mergedPlayers }
}

