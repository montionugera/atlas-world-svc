/**
 * Tests for Room Registry
 */

import { GameRoom } from '../../rooms/GameRoom'
import { GameState } from '../../schemas/GameState'
import { registerRoom, unregisterRoom, getRoom, hasRoom, getAllRoomIds, clearRegistry } from '../registry'

describe('Room Registry', () => {
  let mockRoom: GameRoom
  let mockState: GameState

  beforeEach(() => {
    clearRegistry()
    
    // Create mock room
    mockState = new GameState('test-map', 'test-room-1')
    mockRoom = {
      roomId: 'test-room-1',
      state: mockState,
    } as GameRoom
  })

  afterEach(() => {
    clearRegistry()
  })

  describe('registerRoom', () => {
    it('should register a room', () => {
      registerRoom(mockRoom)
      expect(hasRoom('test-room-1')).toBe(true)
    })

    it('should overwrite existing room with same ID', () => {
      registerRoom(mockRoom)
      
      const mockRoom2 = {
        roomId: 'test-room-1',
        state: new GameState('test-map-2', 'test-room-1'),
      } as GameRoom
      
      registerRoom(mockRoom2)
      expect(getRoom('test-room-1')).toBe(mockRoom2)
    })
  })

  describe('unregisterRoom', () => {
    it('should unregister a room', () => {
      registerRoom(mockRoom)
      expect(hasRoom('test-room-1')).toBe(true)
      
      unregisterRoom('test-room-1')
      expect(hasRoom('test-room-1')).toBe(false)
    })

    it('should handle unregistering non-existent room', () => {
      expect(() => unregisterRoom('non-existent')).not.toThrow()
    })
  })

  describe('getRoom', () => {
    it('should return registered room', () => {
      registerRoom(mockRoom)
      expect(getRoom('test-room-1')).toBe(mockRoom)
    })

    it('should return undefined for non-existent room', () => {
      expect(getRoom('non-existent')).toBeUndefined()
    })
  })

  describe('hasRoom', () => {
    it('should return true for registered room', () => {
      registerRoom(mockRoom)
      expect(hasRoom('test-room-1')).toBe(true)
    })

    it('should return false for non-existent room', () => {
      expect(hasRoom('non-existent')).toBe(false)
    })
  })

  describe('getAllRoomIds', () => {
    it('should return empty array when no rooms registered', () => {
      expect(getAllRoomIds()).toEqual([])
    })

    it('should return all registered room IDs', () => {
      registerRoom(mockRoom)
      
      const mockRoom2 = {
        roomId: 'test-room-2',
        state: new GameState('test-map', 'test-room-2'),
      } as GameRoom
      registerRoom(mockRoom2)
      
      const roomIds = getAllRoomIds()
      expect(roomIds).toContain('test-room-1')
      expect(roomIds).toContain('test-room-2')
      expect(roomIds.length).toBe(2)
    })
  })

  describe('clearRegistry', () => {
    it('should clear all registered rooms', () => {
      registerRoom(mockRoom)
      expect(hasRoom('test-room-1')).toBe(true)
      
      clearRegistry()
      expect(hasRoom('test-room-1')).toBe(false)
      expect(getAllRoomIds()).toEqual([])
    })
  })
})

