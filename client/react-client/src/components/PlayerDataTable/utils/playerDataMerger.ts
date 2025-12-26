/**
 * Merge player data from REST API (metadata) and WebSocket (gameState)
 * REST API provides static/rarely-changing data
 * WebSocket provides real-time data (position, velocity, etc.)
 * 
 * Strategy: Use REST API data as base, overlay real-time data from WebSocket
 */

import { PlayerInstance } from '../../../utils/gameDataManager'
import { GameState } from '../../../types/game'
import { playerFromGameState } from './playerDataConverter'

/**
 * Merge player metadata (REST API) with gameState data (WebSocket)
 * @param gameState - GameState from WebSocket (may be null)
 * @param playersMetadata - Map of player metadata from REST API
 * @returns Merged player instances array
 */
export function mergePlayerData(
  gameState: GameState | null | undefined,
  playersMetadata: Map<string, PlayerInstance>
): PlayerInstance[] {
  // If no gameState, return metadata only
  if (!gameState?.players) {
    return Array.from(playersMetadata.values())
  }

  // Create merged map
  const merged = new Map<string, PlayerInstance>()

  // Start with metadata (REST API data)
  playersMetadata.forEach((metadata, id) => {
    merged.set(id, { ...metadata })
  })

  // Overlay with gameState data (WebSocket real-time data)
  gameState.players.forEach((gamePlayer, id) => {
    const existing = merged.get(id)
    
    // Type assertion: gamePlayer from Colyseus may have more properties than the typed interface
    const playerData = gamePlayer as any
    
    // DEBUG: Log first player's position occasionally
    if (id.startsWith('react-player')) {
       console.log(`[Merger] Player ${id} pos: ${playerData.x}, ${playerData.y} vel: ${playerData.vx}, ${playerData.vy}`)
    }

    if (existing) {
      // Merge: keep metadata, update with real-time fields from gameState
      merged.set(id, {
        ...existing,
        // Update fields that might change in real-time
        currentHealth: playerData.currentHealth ?? existing.currentHealth,
        isAlive: playerData.isAlive ?? existing.isAlive,
        isAttacking: playerData.isAttacking ?? existing.isAttacking,
        lastAttackedTarget: playerData.lastAttackedTarget || existing.lastAttackedTarget,
        // AI & Physics fields
        isBotMode: playerData.isBotMode ?? existing.isBotMode,
        currentBehavior: playerData.currentBehavior ?? existing.currentBehavior,
        currentAttackTarget: playerData.currentAttackTarget ?? existing.currentAttackTarget,
        x: playerData.x ?? existing.x,
        y: playerData.y ?? existing.y,
        vx: playerData.vx ?? existing.vx,
        vy: playerData.vy ?? existing.vy,
      })
    } else {
      // New player in gameState but not in metadata yet - convert from gameState
      merged.set(id, playerFromGameState(playerData))
    }
  })

  return Array.from(merged.values())
}

