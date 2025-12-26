import React from 'react'
import { MobTableRowProps } from '../types'

/**
 * Render a single mob row
 */
export const MobTableRow: React.FC<MobTableRowProps> = ({ mob, isSelected, onSelect }) => {
  const handleClick = () => {
    onSelect(isSelected ? '' : mob.id)
  }

  const healthPercentage = mob.maxHealth > 0 
    ? (mob.currentHealth / mob.maxHealth) * 100 
    : 0

  const healthBarColor = mob.isAlive
    ? (healthPercentage > 50 ? '#4caf50' : '#ff9800')
    : '#f44336'

  return (
    <tr 
      className={isSelected ? 'selected' : ''}
      onClick={handleClick}
    >
      <td className="mob-id">{mob.id.substring(0, 12)}...</td>
      <td className="mob-type">{mob.mobTypeId || 'unknown'}</td>
      <td className="mob-health">
        <div className="health-bar-container">
          <div 
            className="health-bar" 
            style={{ 
              width: `${healthPercentage}%`,
              backgroundColor: healthBarColor
            }}
          />
          <span className="health-text">
            {mob.currentHealth.toFixed(0)}/{mob.maxHealth}
          </span>
        </div>
      </td>
      <td className="mob-status">
        <span className={`status-badge ${mob.isAlive ? 'alive' : 'dead'}`}>
          {mob.isAlive ? '🟢 Alive' : '🔴 Dead'}
        </span>
        {mob.isAttacking && <span className="status-badge attacking">⚔️</span>}
        {mob.isCasting && <span className="status-badge casting">✨</span>}
      </td>
      <td className="mob-behavior">{mob.currentBehavior}</td>
    </tr>
  )
}

