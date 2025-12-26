/**
 * Mob Data Table Component
 * Displays mob instance data from gameState (preferred) or REST API (fallback)
 * 
 * Refactored into smaller, focused components and hooks for better maintainability
 */

import React, { useState, useEffect } from 'react'
import { useGameStateContext } from '../contexts/GameStateContext'
import { MobDataTableProps } from './MobDataTable/types'
import { useEffectiveRoomId } from './MobDataTable/hooks/useEffectiveRoomId'
import { useMobMetadata } from './MobDataTable/hooks/useMobMetadata'
import { useMobDataMerging } from './MobDataTable/hooks/useMobDataMerging'
import { MobTableHeader } from './MobDataTable/components/MobTableHeader'
import { MobTableError } from './MobDataTable/components/MobTableError'
import { MobTableEmpty } from './MobDataTable/components/MobTableEmpty'
import { MobTableBody } from './MobDataTable/components/MobTableBody'
import { MobDetailsPanel } from './MobDataTable/components/MobDetailsPanel'
import './MobDataTable.css'

export const MobDataTable: React.FC<MobDataTableProps> = ({ 
  roomId, 
  gameState: gameStateProp,
  refreshInterval = 5000
}) => {
  const [selectedMob, setSelectedMob] = useState<string | null>(null)

  // Get gameState from context (preferred) or props (fallback)
  const contextState = useGameStateContext()
  const gameState = gameStateProp || contextState.gameState

  // Hooks
  const { effectiveRoomId } = useEffectiveRoomId({ roomId, gameState })
  const { mobsMetadata, loading, error, fetchMobsMetadata } = useMobMetadata({
    effectiveRoomId,
    refreshInterval
  })
  const { mergedMobs } = useMobDataMerging({ gameState, mobsMetadata })

  // Detect new mobs in gameState and fetch their metadata
  useEffect(() => {
    if (!gameState?.mobs || !effectiveRoomId) {
      return
    }

    const currentMobIds = Array.from(gameState.mobs.keys())
    const metadataMobIds = Array.from(mobsMetadata.keys())
    
    // Find mobs in gameState that don't have metadata yet
    const missingMetadata = currentMobIds.filter(id => !metadataMobIds.includes(id))
    
    if (missingMetadata.length > 0) {
      // Fetch metadata for new mobs
      console.log(`📥 Fetching metadata for ${missingMetadata.length} new mob(s)`)
      fetchMobsMetadata(missingMetadata)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.mobs?.size, effectiveRoomId, fetchMobsMetadata])
  // Note: mobsMetadata excluded from deps to avoid infinite loops
  // The effect only runs when mob count changes, which is sufficient

  const selectedMobData = mergedMobs.find(m => m.id === selectedMob)

  // Early return: not connected
  if (!effectiveRoomId && !gameState) {
    return (
      <div className="mob-data-table">
        <MobTableHeader
          mobCount={0}
          loading={false}
          hasGameState={false}
          refreshInterval={refreshInterval}
          onRefresh={() => {}}
        />
        <MobTableEmpty
          message="Not connected to a room"
          debugInfo={!effectiveRoomId ? 'Room ID: null' : undefined}
        />
      </div>
    )
  }

  return (
    <div className="mob-data-table">
      <MobTableHeader
        mobCount={mergedMobs.length}
        loading={loading}
        hasGameState={!!gameState}
        refreshInterval={refreshInterval}
        onRefresh={() => fetchMobsMetadata()}
      />

      {error && (
        <MobTableError error={error} roomId={effectiveRoomId} />
      )}

      {mergedMobs.length === 0 && !loading && !error && (
        <MobTableEmpty message="No mobs in room" />
      )}

      {mergedMobs.length > 0 && (
        <div className="mob-table-content">
          <MobTableBody
            mobs={mergedMobs}
            selectedMobId={selectedMob}
            onSelectMob={(mobId) => setSelectedMob(selectedMob === mobId ? null : mobId)}
          />

          {selectedMobData && (
            <MobDetailsPanel
              mob={selectedMobData}
              onClose={() => setSelectedMob(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}
