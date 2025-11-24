/**
 * Tests for API Route Handlers
 */

import { Request, Response } from 'express'
import { getMobs, getMobById } from '../handlers/mobHandlers'
import { getPlayers, getPlayerById } from '../handlers/playerHandlers'
import { registerRoom, clearRegistry } from '../registry'
import { GameRoom } from '../../rooms/GameRoom'
import { GameState } from '../../schemas/GameState'
import { Mob } from '../../schemas/Mob'
import { Player } from '../../schemas/Player'

describe('API Handlers', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockRoom: GameRoom
  let mockState: GameState

  beforeEach(() => {
    clearRegistry()
    
    mockState = new GameState('test-map', 'test-room')
    mockRoom = {
      roomId: 'test-room',
      state: mockState,
    } as GameRoom
    
    registerRoom(mockRoom)
    
    mockReq = {
      method: 'GET',
      path: '/api/test',
      params: { roomId: 'test-room' },
      query: {},
    } as any
    
    // Attach room to request (as middleware would)
    ;(mockReq as any).room = mockRoom
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any
  })

  afterEach(() => {
    clearRegistry()
  })

  describe('Mob Handlers', () => {
    beforeEach(() => {
      // Add test mobs
      const mob1 = new Mob({ id: 'mob-1', x: 100, y: 100 })
      const mob2 = new Mob({ id: 'mob-2', x: 200, y: 200 })
      mockState.mobs.set('mob-1', mob1)
      mockState.mobs.set('mob-2', mob2)
    })

    describe('getMobs', () => {
      it('should return all mobs', async () => {
        await getMobs(mockReq as Request, mockRes as Response)
        
        expect(mockRes.json).toHaveBeenCalledWith({
          roomId: 'test-room',
          mobs: expect.arrayContaining([
            expect.objectContaining({ id: 'mob-1' }),
            expect.objectContaining({ id: 'mob-2' }),
          ]),
          count: 2,
        })
      })

      it('should return empty array when no mobs', async () => {
        mockState.mobs.clear()
        
        await getMobs(mockReq as Request, mockRes as Response)
        
        expect(mockRes.json).toHaveBeenCalledWith({
          roomId: 'test-room',
          mobs: [],
          count: 0,
        })
      })

      it('should exclude real-time fields', async () => {
        await getMobs(mockReq as Request, mockRes as Response)
        
        const callArgs = (mockRes.json as jest.Mock).mock.calls[0][0]
        const mob = callArgs.mobs[0]
        
        expect(mob).not.toHaveProperty('x')
        expect(mob).not.toHaveProperty('y')
        expect(mob).not.toHaveProperty('vx')
        expect(mob).not.toHaveProperty('vy')
        expect(mob).not.toHaveProperty('heading')
        expect(mob).not.toHaveProperty('isMoving')
      })
    })

    describe('getMobById', () => {
      it('should return specific mob', async () => {
        mockReq.params = { roomId: 'test-room', mobId: 'mob-1' }
        
        await getMobById(mockReq as Request, mockRes as Response)
        
        expect(mockRes.json).toHaveBeenCalledWith({
          mob: expect.objectContaining({ id: 'mob-1' }),
        })
      })

      it('should return 404 for non-existent mob', async () => {
        mockReq.params = { roomId: 'test-room', mobId: 'non-existent' }
        
        await getMobById(mockReq as Request, mockRes as Response)
        
        expect(mockRes.status).toHaveBeenCalledWith(404)
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Mob not found',
          mobId: 'non-existent',
          availableMobs: ['mob-1', 'mob-2'],
        })
      })
    })
  })

  describe('Player Handlers', () => {
    beforeEach(() => {
      // Add test players
      const player1 = new Player('session-1', 'Player1', 100, 100)
      const player2 = new Player('session-2', 'Player2', 200, 200)
      mockState.players.set('session-1', player1)
      mockState.players.set('session-2', player2)
    })

    describe('getPlayers', () => {
      it('should return all players when no IDs specified', async () => {
        await getPlayers(mockReq as Request, mockRes as Response)
        
        expect(mockRes.json).toHaveBeenCalledWith({
          roomId: 'test-room',
          players: expect.arrayContaining([
            expect.objectContaining({ id: 'session-1' }),
            expect.objectContaining({ id: 'session-2' }),
          ]),
          count: 2,
        })
      })

      it('should return specific players by comma-separated IDs', async () => {
        mockReq.query = { ids: 'session-1,session-2' }
        
        await getPlayers(mockReq as Request, mockRes as Response)
        
        expect(mockRes.json).toHaveBeenCalledWith({
          roomId: 'test-room',
          players: expect.arrayContaining([
            expect.objectContaining({ id: 'session-1' }),
            expect.objectContaining({ id: 'session-2' }),
          ]),
          count: 2,
          requestedIds: ['session-1', 'session-2'],
        })
      })

      it('should return specific players by array IDs', async () => {
        mockReq.query = { ids: ['session-1', 'session-2'] }
        
        await getPlayers(mockReq as Request, mockRes as Response)
        
        expect(mockRes.json).toHaveBeenCalledWith({
          roomId: 'test-room',
          players: expect.arrayContaining([
            expect.objectContaining({ id: 'session-1' }),
            expect.objectContaining({ id: 'session-2' }),
          ]),
          count: 2,
          requestedIds: ['session-1', 'session-2'],
        })
      })

      it('should filter out non-existent player IDs', async () => {
        mockReq.query = { ids: 'session-1,non-existent' }
        
        await getPlayers(mockReq as Request, mockRes as Response)
        
        expect(mockRes.json).toHaveBeenCalledWith({
          roomId: 'test-room',
          players: [expect.objectContaining({ id: 'session-1' })],
          count: 1,
          requestedIds: ['session-1', 'non-existent'],
        })
      })

      it('should exclude real-time fields', async () => {
        await getPlayers(mockReq as Request, mockRes as Response)
        
        const callArgs = (mockRes.json as jest.Mock).mock.calls[0][0]
        const player = callArgs.players[0]
        
        expect(player).not.toHaveProperty('x')
        expect(player).not.toHaveProperty('y')
        expect(player).not.toHaveProperty('vx')
        expect(player).not.toHaveProperty('vy')
        expect(player).not.toHaveProperty('heading')
        expect(player).not.toHaveProperty('isMoving')
      })
    })

    describe('getPlayerById', () => {
      it('should return specific player', async () => {
        mockReq.params = { roomId: 'test-room', playerId: 'session-1' }
        
        await getPlayerById(mockReq as Request, mockRes as Response)
        
        expect(mockRes.json).toHaveBeenCalledWith({
          player: expect.objectContaining({ id: 'session-1' }),
        })
      })

      it('should return 404 for non-existent player', async () => {
        mockReq.params = { roomId: 'test-room', playerId: 'non-existent' }
        
        await getPlayerById(mockReq as Request, mockRes as Response)
        
        expect(mockRes.status).toHaveBeenCalledWith(404)
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Player not found',
          playerId: 'non-existent',
          availablePlayers: ['session-1', 'session-2'],
        })
      })
    })
  })
})

