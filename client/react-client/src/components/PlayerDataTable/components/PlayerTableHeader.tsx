import React from 'react'
import { PlayerTableHeaderProps } from '../types'

/**
 * Display header with title, refresh button, and status badges
 */
export const PlayerTableHeader: React.FC<PlayerTableHeaderProps> = ({
  playerCount,
  loading,
  hasGameState,
  refreshInterval,
  onRefresh
}) => {
  return (
    <div className="player-table-header">
      <h3>👤 Players ({playerCount})</h3>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button 
          onClick={onRefresh} 
          disabled={loading}
          className="refresh-btn"
          title="Refresh player metadata"
        >
          {loading ? '⏳' : '🔄'}
        </button>
        {hasGameState && (
          <span className="data-source-badge" title="Using real-time gameState + metadata">
            🔴 Live
          </span>
        )}
        {!hasGameState && (
          <span className="data-source-badge" title={`Polling REST API every ${refreshInterval}ms`}>
            🔄 Polling
          </span>
        )}
      </div>
    </div>
  )
}

