import React from 'react'
import { PlayerTableErrorProps } from '../types'

/**
 * Display error messages
 */
export const PlayerTableError: React.FC<PlayerTableErrorProps> = ({ error, roomId }) => {
  return (
    <div className="player-table-error">
      <p>❌ {error}</p>
      {roomId && <p className="debug-info">Room ID: {roomId}</p>}
    </div>
  )
}

