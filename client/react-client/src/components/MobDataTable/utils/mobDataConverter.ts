import { MobInstance } from '../../../utils/gameDataManager'

/**
 * Convert gameState mob to MobInstance format
 * Handles both Colyseus schema objects and plain objects
 * 
 * @param mob - Mob from gameState (may be Colyseus schema or plain object)
 * @returns MobInstance with all required fields
 */
export function mobFromGameState(mob: any): MobInstance {
  // Colyseus schemas may have properties accessed via getters
  // Try direct access first, then fallback to toJSON() if available
  const mobData = typeof mob.toJSON === 'function' ? mob.toJSON() : mob
  
  return {
    id: mobData.id || mob.id || '',
    mobTypeId: mobData.mobTypeId || mob.mobTypeId || 'unknown',
    radius: mobData.radius ?? mob.radius ?? 0,
    maxHealth: mobData.maxHealth ?? mob.maxHealth ?? 0,
    currentHealth: mobData.currentHealth ?? mob.currentHealth ?? 0,
    isAlive: mobData.isAlive ?? mob.isAlive ?? true,
    attackDamage: mobData.attackDamage ?? mob.attackDamage ?? 0,
    attackRange: mobData.attackRange ?? mob.attackRange ?? 0,
    attackDelay: mobData.attackDelay ?? mob.attackDelay ?? 0,
    defense: mobData.defense ?? mob.defense ?? 0,
    armor: mobData.armor ?? mob.armor ?? 0,
    density: mobData.density ?? mob.density ?? 0,
    maxMoveSpeed: mobData.maxMoveSpeed ?? mob.maxMoveSpeed ?? 0,
    currentBehavior: mobData.currentBehavior || mob.currentBehavior || 'idle',
    tag: mobData.tag || mob.tag || '',
    behaviorLockedUntil: mobData.behaviorLockedUntil ?? mob.behaviorLockedUntil ?? 0,
    isCasting: mobData.isCasting ?? mob.isCasting ?? false,
    isAttacking: mobData.isAttacking ?? mob.isAttacking ?? false,
    lastAttackedTarget: mobData.lastAttackedTarget || mob.lastAttackedTarget || ''
  }
}

/**
 * Extract mob data from Colyseus schema safely
 * Helper function for handling Colyseus schema objects
 * 
 * @param mob - Mob that may be a Colyseus schema object
 * @returns Plain object representation of the mob
 */
export function extractMobData(mob: any): any {
  return typeof mob.toJSON === 'function' ? mob.toJSON() : mob
}

