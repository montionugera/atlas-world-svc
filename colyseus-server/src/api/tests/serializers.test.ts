/**
 * Tests for Data Serializers
 */

import { serializeMobData, serializePlayerData } from '../serializers'
import { Mob } from '../../schemas/Mob'
import { Player } from '../../schemas/Player'

describe('Data Serializers', () => {
  describe('serializeMobData', () => {
    it('should serialize mob data excluding real-time fields', () => {
      const mob = new Mob({
        id: 'mob-1',
        x: 100,
        y: 200,
        vx: 5,
        vy: 10,
      })
      
      mob.heading = 1.5
      mob.isMoving = true
      mob.currentHealth = 80
      mob.maxHealth = 100
      
      const serialized = serializeMobData(mob)
      
      // Should exclude real-time fields
      expect(serialized).not.toHaveProperty('x')
      expect(serialized).not.toHaveProperty('y')
      expect(serialized).not.toHaveProperty('vx')
      expect(serialized).not.toHaveProperty('vy')
      expect(serialized).not.toHaveProperty('heading')
      expect(serialized).not.toHaveProperty('isMoving')
      
      // Should include non-real-time fields
      expect(serialized).toHaveProperty('id')
      expect(serialized).toHaveProperty('currentHealth')
      expect(serialized).toHaveProperty('maxHealth')
      expect(serialized.id).toBe('mob-1')
      expect(serialized.currentHealth).toBe(80)
      expect(serialized.maxHealth).toBe(100)
    })

    it('should handle mob with all fields', () => {
      const mob = new Mob({
        id: 'mob-2',
        x: 50,
        y: 75,
        radius: 4,
        maxHealth: 100,
        attackDamage: 10,
      })
      
      const serialized = serializeMobData(mob)
      
      expect(serialized.id).toBe('mob-2')
      expect(serialized.radius).toBe(4)
      expect(serialized.maxHealth).toBe(100)
      expect(serialized.attackDamage).toBe(10)
      expect(serialized).not.toHaveProperty('x')
      expect(serialized).not.toHaveProperty('y')
    })
  })

  describe('serializePlayerData', () => {
    it('should serialize player data excluding real-time fields', () => {
      const player = new Player('session-1', 'Player1', 150, 250)
      
      player.vx = 3
      player.vy = 4
      player.heading = 0.5
      player.isMoving = true
      player.currentHealth = 90
      
      const serialized = serializePlayerData(player)
      
      // Should exclude real-time fields
      expect(serialized).not.toHaveProperty('x')
      expect(serialized).not.toHaveProperty('y')
      expect(serialized).not.toHaveProperty('vx')
      expect(serialized).not.toHaveProperty('vy')
      expect(serialized).not.toHaveProperty('heading')
      expect(serialized).not.toHaveProperty('isMoving')
      
      // Should include non-real-time fields
      expect(serialized).toHaveProperty('id')
      expect(serialized).toHaveProperty('sessionId')
      expect(serialized).toHaveProperty('name')
      expect(serialized).toHaveProperty('currentHealth')
      expect(serialized.id).toBe('session-1')
      expect(serialized.sessionId).toBe('session-1')
      expect(serialized.name).toBe('Player1')
      expect(serialized.currentHealth).toBe(90)
    })

    it('should handle player with all fields', () => {
      const player = new Player('session-2', 'Player2', 200, 300)
      player.maxLinearSpeed = 25
      player.radius = 1.3
      
      const serialized = serializePlayerData(player)
      
      expect(serialized.id).toBe('session-2')
      expect(serialized.sessionId).toBe('session-2')
      expect(serialized.name).toBe('Player2')
      expect(serialized.maxLinearSpeed).toBe(25)
      expect(serialized.radius).toBe(1.3)
      expect(serialized).not.toHaveProperty('x')
      expect(serialized).not.toHaveProperty('y')
    })
  })
})

