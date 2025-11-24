/**
 * Tests for API Middleware
 */

import { Request, Response, NextFunction } from 'express'
import { handleError, handleNotFound } from '../middleware/errorHandler'
import { validateRoom } from '../middleware/roomValidator'
import { registerRoom, clearRegistry } from '../registry'
import { GameRoom } from '../../rooms/GameRoom'
import { GameState } from '../../schemas/GameState'

describe('API Middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    clearRegistry()
    
    mockReq = {
      method: 'GET',
      path: '/api/test',
      params: {},
      query: {},
    }
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }
    
    mockNext = jest.fn()
  })

  afterEach(() => {
    clearRegistry()
  })

  describe('handleError', () => {
    it('should handle Error objects', () => {
      const error = new Error('Test error')
      handleError(error, mockReq as Request, mockRes as Response, 500)
      
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Error',
        message: 'Test error',
      })
    })

    it('should handle unknown errors', () => {
      const error = 'String error'
      handleError(error, mockReq as Request, mockRes as Response, 400)
      
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Error',
        message: 'Unknown error',
      })
    })
  })

  describe('handleNotFound', () => {
    it('should send 404 with resource info', () => {
      handleNotFound(mockReq as Request, mockRes as Response, 'Mob', 'mob-1')
      
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Mob not found',
        mobId: 'mob-1',
      })
    })

    it('should include available resources if provided', () => {
      handleNotFound(
        mockReq as Request,
        mockRes as Response,
        'Player',
        'player-1',
        ['player-2', 'player-3']
      )
      
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Player not found',
        playerId: 'player-1',
        availablePlayers: ['player-2', 'player-3'],
      })
    })
  })

  describe('validateRoom', () => {
    it('should call next() if room exists', () => {
      const room = {
        roomId: 'test-room',
        state: new GameState('test-map', 'test-room'),
      } as GameRoom
      
      registerRoom(room)
      
      mockReq.params = { roomId: 'test-room' }
      validateRoom(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockNext).toHaveBeenCalled()
      expect((mockReq as any).room).toBe(room)
    })

    it('should return 404 if room does not exist', () => {
      mockReq.params = { roomId: 'non-existent' }
      validateRoom(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 400 if roomId is missing', () => {
      mockReq.params = {}
      validateRoom(mockReq as Request, mockRes as Response, mockNext)
      
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Room ID is required' })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })
})

