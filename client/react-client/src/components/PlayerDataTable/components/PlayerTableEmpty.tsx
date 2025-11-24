import React from 'react'
import { PlayerTableEmptyProps } from '../types'

/**
 * Display empty state message
 */
export const PlayerTableEmpty: React.FC<PlayerTableEmptyProps> = ({ message, debugInfo }) => {
  return (
    <div className="player-table-empty">
      <p>{message}</p>
      {debugInfo && <p className="debug-info">{debugInfo}</p>}
    </div>
  )
}

