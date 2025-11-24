import { useState, useEffect, useCallback } from 'react'
import { gameDataManager, PlayerInstance } from '../../../utils/gameDataManager'
import { UsePlayerMetadataReturn } from '../types'

interface UsePlayerMetadataProps {
  effectiveRoomId: string | null
  refreshInterval: number
}

/**
 * Handle player metadata fetching and state management
 * Fetches metadata from REST API, tracks state, handles loading/error states,
 * manages polling intervals, and detects new players
 * 
 * @param effectiveRoomId - Room ID to fetch metadata for
 * @param refreshInterval - Auto-refresh interval in ms (0 = disabled)
 * @returns Metadata state and fetch functions
 */
export function usePlayerMetadata({
  effectiveRoomId,
  refreshInterval = 5000
}: UsePlayerMetadataProps): UsePlayerMetadataReturn {
  const [playersMetadata, setPlayersMetadata] = useState<Map<string, PlayerInstance>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch metadata for specific player IDs (or all if none specified)
  const fetchPlayersMetadata = useCallback(async (playerIds?: string[]) => {
    if (!effectiveRoomId) {
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const allPlayers = await gameDataManager.getRoomPlayers(
        effectiveRoomId,
        playerIds,
        true // force refresh
      )
      
      // Update metadata map
      setPlayersMetadata(prev => {
        const updated = new Map(prev)
        allPlayers.forEach(player => {
          // Only update if we're fetching all players, or this player is in the requested list
          if (!playerIds || playerIds.includes(player.id)) {
            updated.set(player.id, player)
          }
        })
        return updated
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch players metadata')
      console.error('Error fetching players metadata:', err)
    } finally {
      setLoading(false)
    }
  }, [effectiveRoomId])

  // Refresh metadata (public API)
  const refreshMetadata = useCallback(() => {
    fetchPlayersMetadata()
  }, [fetchPlayersMetadata])

  // Fallback polling: refresh metadata periodically
  useEffect(() => {
    if (!effectiveRoomId) {
      setPlayersMetadata(new Map())
      return
    }

    // Initial fetch
    fetchPlayersMetadata()

    // Set up fallback polling (less frequent - only for metadata refresh)
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchPlayersMetadata()
      }, refreshInterval)
      
      return () => clearInterval(interval)
    }
  }, [effectiveRoomId, refreshInterval, fetchPlayersMetadata])

  return {
    playersMetadata,
    loading,
    error,
    fetchPlayersMetadata,
    refreshMetadata
  }
}

