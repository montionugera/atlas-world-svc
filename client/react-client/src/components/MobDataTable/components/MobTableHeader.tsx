import React from 'react'
import { MobTableHeaderProps } from '../types'

/**
 * Display header with title, refresh button, and status badges
 */
export const MobTableHeader: React.FC<MobTableHeaderProps> = ({
  mobCount,
  loading,
  hasGameState,
  refreshInterval,
  onRefresh
}) => {
  return (
    <div className="mob-table-header">
      <h3>👹 Mobs ({mobCount})</h3>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button 
          onClick={onRefresh} 
          disabled={loading}
          className="refresh-btn"
          title="Refresh mob metadata"
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

