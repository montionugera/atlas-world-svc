import { useMemo } from 'react'
import { GameState } from '../../../types/game'
import { MobInstance } from '../../../utils/gameDataManager'
import { createMergedMobs } from '../utils/mobDataMerger'
import { UseMobDataMergingReturn } from '../types'

interface UseMobDataMergingProps {
  gameState: GameState | null | undefined
  mobsMetadata: Map<string, MobInstance>
}

/**
 * Merge gameState real-time data with metadata
 * Combines gameState mobs with metadata, handling missing metadata gracefully
 * 
 * @param gameState - GameState containing real-time mob data
 * @param mobsMetadata - Map of mob metadata from REST API
 * @returns Array of merged MobInstance objects
 */
export function useMobDataMerging({
  gameState,
  mobsMetadata
}: UseMobDataMergingProps): UseMobDataMergingReturn {
  const mergedMobs = useMemo(() => {
    if (!gameState?.mobs) {
      // No gameState - return metadata only
      return Array.from(mobsMetadata.values())
    }

    return createMergedMobs(gameState.mobs, mobsMetadata)
  }, [gameState?.mobs, gameState?.tick, mobsMetadata])

  return { mergedMobs }
}

