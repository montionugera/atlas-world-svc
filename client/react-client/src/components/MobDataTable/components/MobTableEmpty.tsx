import React from 'react'
import { MobTableEmptyProps } from '../types'

/**
 * Display empty state message
 */
export const MobTableEmpty: React.FC<MobTableEmptyProps> = ({ message, debugInfo }) => {
  return (
    <div className="mob-table-empty">
      <p>{message}</p>
      {debugInfo && <p className="debug-info">{debugInfo}</p>}
    </div>
  )
}

