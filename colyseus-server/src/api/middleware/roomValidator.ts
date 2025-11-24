/**
 * Room Validation Middleware
 * Validates room existence for route handlers
 */

import { Request, Response, NextFunction } from 'express'
import { getRoom } from '../registry'
import { handleNotFound } from './errorHandler'

/**
 * Middleware to validate room exists
 * Adds room to request object if found
 */
export function validateRoom(req: Request, res: Response, next: NextFunction): void {
  const { roomId } = req.params
  
  if (!roomId) {
    res.status(400).json({ error: 'Room ID is required' })
    return
  }
  
  const room = getRoom(roomId)
  
  if (!room) {
    handleNotFound(req, res, 'Room', roomId)
    return
  }
  
  // Attach room to request for use in handlers
  ;(req as any).room = room
  next()
}

