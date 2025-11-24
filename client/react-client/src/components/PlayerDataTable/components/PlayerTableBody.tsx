import React from 'react'
import { PlayerTableBodyProps } from '../types'
import { PlayerTableRow } from './PlayerTableRow'

/**
 * Render table body with player rows
 */
export const PlayerTableBody: React.FC<PlayerTableBodyProps> = ({
  players,
  selectedPlayerId,
  onSelectPlayer
}) => {
  return (
    <table className="player-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Health</th>
          <th>Status</th>
          <th>Speed</th>
        </tr>
      </thead>
      <tbody>
        {players.map(player => (
          <PlayerTableRow
            key={player.id}
            player={player}
            isSelected={selectedPlayerId === player.id}
            onSelect={onSelectPlayer}
          />
        ))}
      </tbody>
    </table>
  )
}

