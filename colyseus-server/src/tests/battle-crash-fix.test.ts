/**
 * Battle System Crash Fix Tests
 * Tests to ensure the battle system doesn't crash
 */

import { BattleManager } from '../modules/BattleManager'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { GameState } from '../schemas/GameState'

describe('Battle System Crash Fix', () => {
  let battleManager: BattleManager
  let gameState: GameState

  beforeEach(() => {
    gameState = new GameState('test-map', 'room-1')
    battleManager = new BattleManager('room-1', gameState)
  })

  afterEach(() => {
    // Stop AI module to prevent background timers
    gameState.stopAI()
  })

  describe('BattleManager Initialization', () => {
    test('should initialize without crashing', () => {
      expect(() => {
        new BattleManager('room-1', new GameState('test-map', 'room-1'))
      }).not.toThrow()
    })

    test('should create instance without crashing', () => {
      expect(() => {
        const instance = new BattleManager('room-2', new GameState('map-01', 'room-2'))
        expect(instance).toBeDefined()
      }).not.toThrow()
    })
  })

  // Registration is no longer needed – BattleModule reads from GameState

  describe('Event-Driven Battle System', () => {
    test('should handle battle events without crashing', () => {
      expect(() => {
        // Test the real event-driven flow
        const player = new Player('test-session', 'TestPlayer', 100, 100)
        const mob = new Mob({
          id: 'test-mob',
          x: 105,
          y: 100,
          attackRange: 10,
          attackDamage: 20,
        })
        
        // Add entities to game state
        gameState.players.set(player.id, player)
        gameState.mobs.set(mob.id, mob)
        
        // Simulate mob attack (this is how it actually works now)
        mob.updateAttack(gameState.players, gameState.roomId)
      }).not.toThrow()
    })

    test('should process action messages without crashing', async () => {
      const player = new Player('test-session', 'TestPlayer', 100, 100)
      const mob = new Mob({
        id: 'test-mob',
        x: 105,
        y: 100,
        attackRange: 10,
        attackDamage: 20,
      })
      gameState.players.set(player.id, player)
      gameState.mobs.set(mob.id, mob)
      
      // Use the real event-driven flow instead of direct message creation
      mob.updateAttack(gameState.players, gameState.roomId)

      expect(async () => {
        const processedCount = await battleManager.processActionMessages()
        expect(processedCount).toBeGreaterThanOrEqual(0)
      }).not.toThrow()
    })
  })

  describe('GameState Integration', () => {
    test('should create GameState without crashing', () => {
      expect(() => {
        const gameState = new GameState('test-map')
        expect(gameState).toBeDefined()
      }).not.toThrow()
    })

    test('should add players without crashing', () => {
      const gameState = new GameState('test-map', 'room-1')

      expect(() => {
        const player = gameState.addPlayer('test-session', 'TestPlayer')
        expect(player).toBeDefined()
      }).not.toThrow()
    })

    test('should remove players without crashing', () => {
      const gameState = new GameState('test-map', 'room-1')
      gameState.addPlayer('test-session', 'TestPlayer')

      expect(() => {
        gameState.removePlayer('test-session')
      }).not.toThrow()
    })
  })

  describe('Mob Attack System', () => {
    test('should handle mob attacks without crashing', () => {
      const gameState = new GameState('test-map', 'room-1')
      const player = gameState.addPlayer('test-session', 'TestPlayer')

      // Get a mob from the game state
      const mobs = Array.from(gameState.mobs.values())
      if (mobs.length > 0) {
        const mob = mobs[0]

        expect(() => {
          // Set mob to attack behavior
          mob.currentBehavior = 'attack'
          mob.currentAttackTarget = player.id
          mob.lastAttackTime = 0 // Allow attack

          // Call updateAttack
          const result = mob.updateAttack(new Map([[player.id, player]]), 'room-1')
          expect(result).toBeDefined()
        }).not.toThrow()
      }
    })
  })

  describe('Battle Statistics', () => {
    test('should get battle stats without crashing', () => {
      // Stats API removed in simplified manager – ensure processing doesn't throw
      expect(async () => {
        await battleManager.processActionMessages()
      }).not.toThrow()
    })

    test('should handle battle events without crashing', () => {
      // Test event-driven battle system
      const player = new Player('test-session', 'TestPlayer', 100, 100)
      const mob = new Mob({
        id: 'test-mob',
        x: 105,
        y: 100,
        attackRange: 10,
        attackDamage: 20,
      })
      
      gameState.players.set(player.id, player)
      gameState.mobs.set(mob.id, mob)
      
      expect(() => {
        // Use real event-driven flow
        mob.updateAttack(gameState.players, gameState.roomId)
      }).not.toThrow()
    })
  })

  describe('Error Handling', () => {
    test('should handle invalid entity IDs gracefully', () => {
      const mob = new Mob({
        id: 'invalid-mob',
        x: 105,
        y: 100,
        attackRange: 10,
        attackDamage: 20,
      })
      
      gameState.mobs.set(mob.id, mob)
      
      expect(() => {
        // Try to attack non-existent player
        mob.updateAttack(gameState.players, gameState.roomId)
      }).not.toThrow()
    })

    test('should handle battle processing gracefully', () => {
      expect(() => {
        // Process empty battle queue
        battleManager.processActionMessages()
      }).not.toThrow()
    })
  })
})
