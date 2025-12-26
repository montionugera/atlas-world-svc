/**
 * Player Data Table Component
 * Displays player instance data from gameState (preferred) or REST API (fallback)
 * 
 * Refactored into smaller, focused components and hooks for better maintainability
 */

import React from 'react'
import { useGameStateContext } from '../../contexts/GameStateContext'
import { PlayerDataTableProps } from './types'
import { useEffectiveRoomId } from './hooks/useEffectiveRoomId'
import { usePlayerDataMerging } from './hooks/usePlayerDataMerging'
import { PlayerDebugPanel } from './components/PlayerDebugPanel'
import { usePlayersMetadata } from './hooks/usePlayersMetadata'

export const PlayerDataTable: React.FC<PlayerDataTableProps> = ({ 
  roomId, 
  gameState: gameStateProp,
  refreshInterval = 5000,
  onDebugTeleport,
  onDebugSpawnMob,
  updateCount
}) => {
  // Get gameState from context (preferred) or props (fallback)
  const contextState = useGameStateContext()
  const gameState = gameStateProp || contextState.gameState

  // Use custom hook to fetch metadata
  const { playersMetadata } = usePlayersMetadata(roomId, refreshInterval)

  // Hooks
  const { effectiveRoomId } = useEffectiveRoomId({ roomId, gameState })
  // Use custom hook to merge data
  const { mergedPlayers } = usePlayerDataMerging({ 
    gameState: gameStateProp || contextState?.gameState, 
    playersMetadata,
    updateCount
  })

  // Early return: not connected
  if (!effectiveRoomId && !gameState) {
    return <div className="player-data-table">Not connected</div>
  }

  return (
    <div className="player-data-table" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px' }}>
      <h3>Player Debug Panel (Connected: {contextState?.isConnected ? 'YES' : 'NO'}, Updates: {updateCount}, Tick: {gameState?.tick})</h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {mergedPlayers.map(player => (
          <PlayerDebugPanel 
            key={player.id} 
            player={player} 
            onDebugTeleport={onDebugTeleport}
            onDebugSpawnMob={onDebugSpawnMob}
          />
        ))}
      </div>
      {mergedPlayers.length === 0 && <div>No players found</div>}
    </div>
  )
}

