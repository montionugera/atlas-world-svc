/**
 * Room Registry
 * Manages active game rooms for REST API access
 */

import { GameRoom } from '../rooms/GameRoom'

/**
 * Room registry to track active rooms for REST API access
 */
export const roomRegistry = new Map<string, GameRoom>()

/**
 * Register a room in the registry
 * @param room - GameRoom instance to register
 */
export function registerRoom(room: GameRoom): void {
  roomRegistry.set(room.roomId, room)
}

/**
 * Unregister a room from the registry
 * @param roomId - Room ID to unregister
 */
export function unregisterRoom(roomId: string): void {
  roomRegistry.delete(roomId)
}

/**
 * Get a room from the registry
 * @param roomId - Room ID to retrieve
 * @returns GameRoom instance or undefined if not found
 */
export function getRoom(roomId: string): GameRoom | undefined {
  return roomRegistry.get(roomId)
}

/**
 * Check if a room exists in the registry
 * @param roomId - Room ID to check
 * @returns true if room exists, false otherwise
 */
export function hasRoom(roomId: string): boolean {
  return roomRegistry.has(roomId)
}

/**
 * Get all registered room IDs
 * @returns Array of room IDs
 */
export function getAllRoomIds(): string[] {
  return Array.from(roomRegistry.keys())
}

/**
 * Clear all rooms from registry (useful for testing)
 */
export function clearRegistry(): void {
  roomRegistry.clear()
}

