/**
 * Mob Route Handlers
 * Handles all mob-related API endpoints
 */

import { Request, Response } from 'express'
import { GameRoom } from '../../rooms/GameRoom'
import { serializeMobData } from '../serializers'
import { handleError, handleNotFound } from '../middleware/errorHandler'

/**
 * GET /api/rooms/:roomId/mobs
 * Returns list of all mobs in a room (non-real-time data only)
 */
export async function getMobs(req: Request, res: Response): Promise<void> {
  try {
    const room = (req as any).room as GameRoom
    
    // Get room's state and serialize mobs
    const mobs = Array.from(room.state.mobs.values()).map(mob => serializeMobData(mob))
    
    res.json({ 
      roomId: room.roomId,
      mobs,
      count: mobs.length 
    })
  } catch (error) {
    handleError(error, req, res, 500)
  }
}

/**
 * GET /api/rooms/:roomId/mobs/:mobId
 * Returns non-real-time data for a specific mob instance
 */
export async function getMobById(req: Request, res: Response): Promise<void> {
  try {
    const room = (req as any).room as GameRoom
    const { mobId } = req.params
    
    const mob = room.state.mobs.get(mobId)
    
    if (!mob) {
      return handleNotFound(
        req,
        res,
        'Mob',
        mobId,
        Array.from(room.state.mobs.keys())
      )
    }
    
    res.json({
      mob: serializeMobData(mob)
    })
  } catch (error) {
    handleError(error, req, res, 500)
  }
}

