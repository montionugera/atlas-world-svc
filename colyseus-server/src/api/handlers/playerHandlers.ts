/**
 * Player Route Handlers
 * Handles all player-related API endpoints
 */

import { Request, Response } from 'express'
import { GameRoom } from '../../rooms/GameRoom'
import { Player } from '../../schemas/Player'
import { serializePlayerData } from '../serializers'
import { handleError, handleNotFound } from '../middleware/errorHandler'
import { ParsedPlayerIds } from '../types'

/**
 * Parse player IDs from query parameters
 * Supports both comma-separated and array formats
 * @param ids - Query parameter value (Express ParsedQs type)
 * @returns Parsed player IDs or null if not provided
 */
function parsePlayerIds(ids: any): string[] | null {
  if (!ids) return null
  
  if (Array.isArray(ids)) {
    // Handle ids[]=id1&ids[]=id2 format
    return ids
      .filter(id => typeof id === 'string' && id.trim().length > 0)
      .map(id => id.trim())
  }
  
  if (typeof ids === 'string') {
    // Handle ids=id1,id2,id3 format
    return ids.split(',').map(id => id.trim()).filter(id => id.length > 0)
  }
  
  return null
}

/**
 * GET /api/rooms/:roomId/players
 * Returns list of players in a room (non-real-time data only)
 * Query parameters:
 *   - ids: Comma-separated list of player IDs to fetch (optional)
 *   - ids[]: Array of player IDs (alternative format, optional)
 * If no IDs provided, returns all players
 */
export async function getPlayers(req: Request, res: Response): Promise<void> {
  try {
    const room = (req as any).room as GameRoom
    const { ids } = req.query
    
    // Parse player IDs from query parameters
    const playerIds = parsePlayerIds(ids)
    
    let players: any[]
    if (playerIds && playerIds.length > 0) {
      // Fetch specific players by IDs
      players = playerIds
        .map(id => room.state.players.get(id))
        .filter((player): player is Player => player !== undefined)
        .map(player => serializePlayerData(player))
    } else {
      // Fetch all players
      players = Array.from(room.state.players.values()).map(player => serializePlayerData(player))
    }
    
    const response: any = { 
      roomId: room.roomId,
      players,
      count: players.length
    }
    
    if (playerIds) {
      response.requestedIds = playerIds
    }
    
    res.json(response)
  } catch (error) {
    handleError(error, req, res, 500)
  }
}

/**
 * GET /api/rooms/:roomId/players/:playerId
 * Returns non-real-time data for a specific player instance
 */
export async function getPlayerById(req: Request, res: Response): Promise<void> {
  try {
    const room = (req as any).room as GameRoom
    const { playerId } = req.params
    
    const player = room.state.players.get(playerId)
    
    if (!player) {
      return handleNotFound(
        req,
        res,
        'Player',
        playerId,
        Array.from(room.state.players.keys())
      )
    }
    
    res.json({
      player: serializePlayerData(player)
    })
  } catch (error) {
    handleError(error, req, res, 500)
  }
}

