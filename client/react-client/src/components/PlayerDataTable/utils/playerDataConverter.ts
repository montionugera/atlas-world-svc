/**
 * Convert player from gameState to PlayerInstance format
 * Handles conversion from Colyseus schema to REST API format
 */

import { PlayerInstance } from '../../../utils/gameDataManager'

/**
 * Convert player from gameState (WebSocket) to PlayerInstance format
 * @param gamePlayer - Player from gameState
 * @returns PlayerInstance compatible object
 */
export function playerFromGameState(gamePlayer: any): PlayerInstance {
  return {
    id: gamePlayer.id || gamePlayer.sessionId || '',
    sessionId: gamePlayer.sessionId || gamePlayer.id || '',
    name: gamePlayer.name || 'Unknown',
    maxLinearSpeed: gamePlayer.maxLinearSpeed ?? 20,
    radius: gamePlayer.radius ?? 1.3,
    maxHealth: gamePlayer.maxHealth ?? 100,
    currentHealth: gamePlayer.currentHealth ?? 100,
    isAlive: gamePlayer.isAlive ?? true,
    attackDamage: gamePlayer.attackDamage ?? 10,
    attackRange: gamePlayer.attackRange ?? 5,
    attackDelay: gamePlayer.attackDelay ?? 1000,
    defense: gamePlayer.defense ?? 0,
    armor: gamePlayer.armor ?? 0,
    density: gamePlayer.density ?? 1,
    isAttacking: gamePlayer.isAttacking ?? false,
    lastAttackedTarget: gamePlayer.lastAttackedTarget || '',
    // AI & Physics fields
    isBotMode: gamePlayer.isBotMode ?? false,
    currentBehavior: gamePlayer.currentBehavior || 'idle',
    currentAttackTarget: gamePlayer.currentAttackTarget || '',
    x: gamePlayer.x ?? 0,
    y: gamePlayer.y ?? 0,
    vx: gamePlayer.vx ?? 0,
    vy: gamePlayer.vy ?? 0,
  }
}

