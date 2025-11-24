/**
 * REST API Routes for Static Game Data
 * Offloads static/rarely-changing data from real-time WebSocket sync
 */

import { Router } from 'express'
import { Server } from 'colyseus'
import { validateRoom } from './middleware/roomValidator'
import * as mobHandlers from './handlers/mobHandlers'
import * as playerHandlers from './handlers/playerHandlers'

/**
 * Create router with Colyseus server instance for room access
 * @param gameServer - Colyseus server instance (for future use)
 * @returns Express router with API routes
 */
export function createApiRouter(gameServer: Server): Router {
  const router = Router()

  // Mob routes
  router.get('/rooms/:roomId/mobs', validateRoom, mobHandlers.getMobs)
  router.get('/rooms/:roomId/mobs/:mobId', validateRoom, mobHandlers.getMobById)

  // Player routes
  router.get('/rooms/:roomId/players', validateRoom, playerHandlers.getPlayers)
  router.get('/rooms/:roomId/players/:playerId', validateRoom, playerHandlers.getPlayerById)

  return router
}

// Re-export registry functions for use in GameRoom
export { registerRoom, unregisterRoom } from './registry'

