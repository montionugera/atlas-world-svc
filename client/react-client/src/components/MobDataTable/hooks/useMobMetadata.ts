import { useState, useEffect, useCallback } from 'react'
import { gameDataManager, MobInstance } from '../../../utils/gameDataManager'
import { UseMobMetadataReturn } from '../types'

interface UseMobMetadataProps {
  effectiveRoomId: string | null
  refreshInterval: number
}

/**
 * Handle metadata fetching and state management
 * Fetches metadata from REST API, tracks state, handles loading/error states,
 * manages polling intervals, and detects new mobs
 * 
 * @param effectiveRoomId - Room ID to fetch metadata for
 * @param refreshInterval - Auto-refresh interval in ms (0 = disabled)
 * @returns Metadata state and fetch functions
 */
export function useMobMetadata({
  effectiveRoomId,
  refreshInterval = 5000
}: UseMobMetadataProps): UseMobMetadataReturn {
  const [mobsMetadata, setMobsMetadata] = useState<Map<string, MobInstance>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch metadata for specific mob IDs (or all if none specified)
  const fetchMobsMetadata = useCallback(async (mobIds?: string[]) => {
    if (!effectiveRoomId) {
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const allMobs = await gameDataManager.getRoomMobs(effectiveRoomId, true)
      
      // Update metadata map
      setMobsMetadata(prev => {
        const updated = new Map(prev)
        allMobs.forEach(mob => {
          // Only update if we're fetching all mobs, or this mob is in the requested list
          if (!mobIds || mobIds.includes(mob.id)) {
            updated.set(mob.id, mob)
          }
        })
        return updated
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch mobs metadata')
      console.error('Error fetching mobs metadata:', err)
    } finally {
      setLoading(false)
    }
  }, [effectiveRoomId])

  // Refresh metadata (public API)
  const refreshMetadata = useCallback(() => {
    fetchMobsMetadata()
  }, [fetchMobsMetadata])

  // Fallback polling: refresh metadata periodically
  useEffect(() => {
    if (!effectiveRoomId) {
      setMobsMetadata(new Map())
      return
    }

    // Initial fetch
    fetchMobsMetadata()

    // Set up fallback polling (less frequent - only for metadata refresh)
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchMobsMetadata()
      }, refreshInterval)
      
      return () => clearInterval(interval)
    }
  }, [effectiveRoomId, refreshInterval, fetchMobsMetadata])

  return {
    mobsMetadata,
    loading,
    error,
    fetchMobsMetadata,
    refreshMetadata
  }
}

