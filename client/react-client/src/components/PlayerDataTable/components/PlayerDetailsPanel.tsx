import React from 'react'
import { PlayerDetailsPanelProps } from '../types'

/**
 * Display detailed information about selected player
 */
export const PlayerDetailsPanel: React.FC<PlayerDetailsPanelProps> = ({ player, onClose }) => {
  const healthPercentage = player.maxHealth > 0
    ? ((player.currentHealth / player.maxHealth) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="player-details">
      <div className="details-header">
        <h4>Player Details: {player.name || player.id}</h4>
        <button onClick={onClose} className="close-btn">×</button>
      </div>
      <div className="details-grid">
        <div className="detail-item">
          <span className="detail-label">Session ID:</span>
          <span className="detail-value">{player.sessionId}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Name:</span>
          <span className="detail-value">{player.name}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Health:</span>
          <span className="detail-value">
            {player.currentHealth.toFixed(1)} / {player.maxHealth}
            ({healthPercentage}%)
          </span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Status:</span>
          <span className="detail-value">
            {player.isAlive ? 'Alive' : 'Dead'}
            {player.isAttacking && ' | Attacking'}
          </span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Max Speed:</span>
          <span className="detail-value">{player.maxLinearSpeed}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Radius:</span>
          <span className="detail-value">{player.radius}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Attack Damage:</span>
          <span className="detail-value">{player.attackDamage}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Attack Range:</span>
          <span className="detail-value">{player.attackRange}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Attack Delay:</span>
          <span className="detail-value">{player.attackDelay}ms</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Defense:</span>
          <span className="detail-value">{player.defense}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Armor:</span>
          <span className="detail-value">{player.armor}</span>
        </div>
        {player.lastAttackedTarget && (
          <div className="detail-item">
            <span className="detail-label">Last Target:</span>
            <span className="detail-value">{player.lastAttackedTarget}</span>
          </div>
        )}
      </div>
    </div>
  )
}

