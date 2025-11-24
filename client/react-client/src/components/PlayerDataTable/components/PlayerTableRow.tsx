import React from 'react'
import { PlayerTableRowProps } from '../types'

/**
 * Render a single player row
 */
export const PlayerTableRow: React.FC<PlayerTableRowProps> = ({ player, isSelected, onSelect }) => {
  const handleClick = () => {
    onSelect(isSelected ? '' : player.id)
  }

  const healthPercentage = player.maxHealth > 0 
    ? (player.currentHealth / player.maxHealth) * 100 
    : 0

  const healthBarColor = player.isAlive
    ? (healthPercentage > 50 ? '#4caf50' : '#ff9800')
    : '#f44336'

  return (
    <tr 
      className={isSelected ? 'selected' : ''}
      onClick={handleClick}
    >
      <td className="player-id">{player.id.substring(0, 12)}...</td>
      <td className="player-name">{player.name || 'Unknown'}</td>
      <td className="player-health">
        <div className="health-bar-container">
          <div 
            className="health-bar" 
            style={{ 
              width: `${healthPercentage}%`,
              backgroundColor: healthBarColor
            }}
          />
          <span className="health-text">
            {player.currentHealth.toFixed(0)}/{player.maxHealth}
          </span>
        </div>
      </td>
      <td className="player-status">
        <span className={`status-badge ${player.isAlive ? 'alive' : 'dead'}`}>
          {player.isAlive ? '🟢 Alive' : '🔴 Dead'}
        </span>
        {player.isAttacking && <span className="status-badge attacking">⚔️</span>}
      </td>
      <td className="player-speed">{player.maxLinearSpeed}</td>
    </tr>
  )
}

