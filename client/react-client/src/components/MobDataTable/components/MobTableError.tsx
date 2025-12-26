import React from 'react'
import { MobTableErrorProps } from '../types'

/**
 * Display error messages
 */
export const MobTableError: React.FC<MobTableErrorProps> = ({ error, roomId }) => {
  return (
    <div className="mob-table-error">
      <p>❌ {error}</p>
      {roomId && <p className="debug-info">Room ID: {roomId}</p>}
    </div>
  )
}

