/**
 * Player Data Table Component
 * Displays player instance data from gameState (preferred) or REST API (fallback)
 * 
 * Refactored into smaller, focused components and hooks for better maintainability
 */

import React, { useState, useEffect } from 'react'
import { useGameStateContext } from '../../contexts/GameStateContext'
import { PlayerDataTableProps } from './types'
import { useEffectiveRoomId } from './hooks/useEffectiveRoomId'
import { usePlayerMetadata } from './hooks/usePlayerMetadata'
import { usePlayerDataMerging } from './hooks/usePlayerDataMerging'
import { PlayerTableHeader } from './components/PlayerTableHeader'
import { PlayerTableError } from './components/PlayerTableError'
import { PlayerTableEmpty } from './components/PlayerTableEmpty'
import { PlayerTableBody } from './components/PlayerTableBody'
import { PlayerDetailsPanel } from './components/PlayerDetailsPanel'
import './PlayerDataTable.css'

export const PlayerDataTable: React.FC<PlayerDataTableProps> = ({ 
  roomId, 
  gameState: gameStateProp,
  refreshInterval = 5000
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)

  // Get gameState from context (preferred) or props (fallback)
  const contextState = useGameStateContext()
  const gameState = gameStateProp || contextState.gameState

  // Hooks
  const { effectiveRoomId } = useEffectiveRoomId({ roomId, gameState })
  const { playersMetadata, loading, error, fetchPlayersMetadata } = usePlayerMetadata({
    effectiveRoomId,
    refreshInterval
  })
  const { mergedPlayers } = usePlayerDataMerging({ gameState, playersMetadata })

  // Detect new players in gameState and fetch their metadata
  useEffect(() => {
    if (!gameState?.players || !effectiveRoomId) {
      return
    }

    const currentPlayerIds = Array.from(gameState.players.keys())
    const metadataPlayerIds = Array.from(playersMetadata.keys())
    
    // Find players in gameState that don't have metadata yet
    const missingMetadata = currentPlayerIds.filter(id => !metadataPlayerIds.includes(id))
    
    if (missingMetadata.length > 0) {
      // Fetch metadata for new players
      console.log(`📥 Fetching metadata for ${missingMetadata.length} new player(s)`)
      fetchPlayersMetadata(missingMetadata)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.players?.size, effectiveRoomId, fetchPlayersMetadata])
  // Note: playersMetadata excluded from deps to avoid infinite loops
  // The effect only runs when player count changes, which is sufficient

  const selectedPlayerData = mergedPlayers.find(p => p.id === selectedPlayer)

  // Early return: not connected
  if (!effectiveRoomId && !gameState) {
    return (
      <div className="player-data-table">
        <PlayerTableHeader
          playerCount={0}
          loading={false}
          hasGameState={false}
          refreshInterval={refreshInterval}
          onRefresh={() => {}}
        />
        <PlayerTableEmpty
          message="Not connected to a room"
          debugInfo={!effectiveRoomId ? 'Room ID: null' : undefined}
        />
      </div>
    )
  }

  return (
    <div className="player-data-table">
      <PlayerTableHeader
        playerCount={mergedPlayers.length}
        loading={loading}
        hasGameState={!!gameState}
        refreshInterval={refreshInterval}
        onRefresh={() => fetchPlayersMetadata()}
      />

      {error && (
        <PlayerTableError error={error} roomId={effectiveRoomId} />
      )}

      {mergedPlayers.length === 0 && !loading && !error && (
        <PlayerTableEmpty message="No players in room" />
      )}

      {mergedPlayers.length > 0 && (
        <div className="player-table-content">
          <PlayerTableBody
            players={mergedPlayers}
            selectedPlayerId={selectedPlayer}
            onSelectPlayer={(playerId) => setSelectedPlayer(selectedPlayer === playerId ? null : playerId)}
          />

          {selectedPlayerData && (
            <PlayerDetailsPanel
              player={selectedPlayerData}
              onClose={() => setSelectedPlayer(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

