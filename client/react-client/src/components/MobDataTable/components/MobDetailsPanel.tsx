import React from 'react'
import { MobDetailsPanelProps } from '../types'

/**
 * Display detailed information about selected mob
 */
export const MobDetailsPanel: React.FC<MobDetailsPanelProps> = ({ mob }) => {
  const healthPercentage = mob.maxHealth > 0
    ? ((mob.currentHealth / mob.maxHealth) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="mob-details">
      <h4>Mob Details: {mob.id}</h4>
      <div className="details-grid">
        <div className="detail-item">
          <span className="detail-label">Type:</span>
          <span className="detail-value">{mob.mobTypeId}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Health:</span>
          <span className="detail-value">
            {mob.currentHealth.toFixed(1)} / {mob.maxHealth}
            ({healthPercentage}%)
          </span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Status:</span>
          <span className="detail-value">
            {mob.isAlive ? 'Alive' : 'Dead'}
            {mob.isAttacking && ' | Attacking'}
            {mob.isCasting && ' | Casting'}
          </span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Behavior:</span>
          <span className="detail-value">{mob.currentBehavior}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Tag:</span>
          <span className="detail-value">{mob.tag}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Attack Damage:</span>
          <span className="detail-value">{mob.attackDamage}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Attack Range:</span>
          <span className="detail-value">{mob.attackRange}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Attack Delay:</span>
          <span className="detail-value">{mob.attackDelay}ms</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Defense:</span>
          <span className="detail-value">{mob.defense}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Armor:</span>
          <span className="detail-value">{mob.armor}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Max Move Speed:</span>
          <span className="detail-value">{mob.maxMoveSpeed}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Radius:</span>
          <span className="detail-value">{mob.radius.toFixed(2)}</span>
        </div>
        {mob.lastAttackedTarget && (
          <div className="detail-item">
            <span className="detail-label">Last Target:</span>
            <span className="detail-value">{mob.lastAttackedTarget}</span>
          </div>
        )}
      </div>
    </div>
  )
}

