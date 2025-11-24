/**
 * Data Serializers
 * Serialize game entities to JSON, excluding real-time fields
 * Real-time fields (x, y, vx, vy, heading, isMoving) should come from WebSocket
 */

import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'

/**
 * Real-time fields that should be excluded from REST API responses
 * These fields change frequently and should come from WebSocket sync
 */
const REALTIME_FIELDS = ['x', 'y', 'vx', 'vy', 'heading', 'isMoving'] as const

/**
 * Remove real-time fields from serialized data
 * @param serialized - Serialized object from Colyseus schema
 * @returns Object without real-time fields
 */
function removeRealtimeFields<T extends Record<string, any>>(serialized: T): Omit<T, typeof REALTIME_FIELDS[number]> {
  const { x, y, vx, vy, heading, isMoving, ...nonRealtimeData } = serialized
  return nonRealtimeData
}

/**
 * Serialize mob to JSON, excluding real-time fields
 * Real-time fields: x, y, vx, vy, heading, isMoving (should come from WebSocket)
 * @param mob - Mob instance to serialize
 * @returns Serialized mob data without real-time fields
 */
export function serializeMobData(mob: Mob): any {
  const serialized = mob.toJSON()
  return removeRealtimeFields(serialized)
}

/**
 * Serialize player to JSON, excluding real-time fields
 * Real-time fields: x, y, vx, vy, heading, isMoving (should come from WebSocket)
 * @param player - Player instance to serialize
 * @returns Serialized player data without real-time fields
 */
export function serializePlayerData(player: Player): any {
  const serialized = player.toJSON()
  return removeRealtimeFields(serialized)
}

