import React from 'react'
import { MobTableBodyProps } from '../types'
import { MobTableRow } from './MobTableRow'

/**
 * Render table body with all mob rows
 */
export const MobTableBody: React.FC<MobTableBodyProps> = ({ mobs, selectedMobId, onSelectMob }) => {
  return (
    <table className="mob-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Type</th>
          <th>Health</th>
          <th>Status</th>
          <th>Behavior</th>
        </tr>
      </thead>
      <tbody>
        {mobs.map(mob => (
          <MobTableRow
            key={mob.id}
            mob={mob}
            isSelected={selectedMobId === mob.id}
            onSelect={onSelectMob}
          />
        ))}
      </tbody>
    </table>
  )
}

