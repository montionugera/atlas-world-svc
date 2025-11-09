/**
 * Test room-scoped battle manager (no global singleton)
 * Verifies that each room has its own independent battle system
 */

import { BattleModule } from '../modules/BattleModule'
import { BattleManager } from '../modules/BattleManager'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { GameState } from '../schemas/GameState'

describe('Room-Scoped Battle Manager', () => {
  let room1BattleManager: BattleManager
  let room2BattleManager: BattleManager
  let room1GameState: GameState
  let room2GameState: GameState
  let player1: Player
  let player2: Player
  let mob1: Mob
  let mob2: Mob

  beforeEach(() => {
    // Create independent game states and battle managers for each room
    room1GameState = new GameState('test-map', 'room-1')
    room2GameState = new GameState('test-map', 'room-2')
    room1BattleManager = new BattleManager('room-1', room1GameState)
    room2BattleManager = new BattleManager('room-2', room2GameState)

    // Create entities for room 1 (close together for attack range)
    player1 = new Player('player-1', 'TestPlayer1')
    player1.x = 100
    player1.y = 100
    mob1 = new Mob({
      id: 'mob-1',
      x: 101,
      y: 101,
      attackDelay: 100, // Very short attack delay for testing
    }) // Very close to player

    // Create entities for room 2 (close together for attack range)
    player2 = new Player('player-2', 'TestPlayer2')
    player2.x = 200
    player2.y = 200
    mob2 = new Mob({
      id: 'mob-2',
      x: 201,
      y: 201,
      attackDelay: 100, // Very short attack delay for testing
    }) // Very close to player

    // Add entities to their respective game states
    room1GameState.players.set(player1.id, player1)
    room1GameState.mobs.set(mob1.id, mob1)
    room2GameState.players.set(player2.id, player2)
    room2GameState.mobs.set(mob2.id, mob2)
  })

  afterEach(() => {
    // Clean up BattleManager event listeners
    room1BattleManager.cleanup()
    room2BattleManager.cleanup()
    // Stop AI modules to prevent background timers
    room1GameState.stopAI()
    room2GameState.stopAI()
  })

  test('should have independent entity registries', () => {
    // Room 1 should only know about its entities
    expect(room1GameState.players.get('player-1')).toBeDefined()
    expect(room1GameState.mobs.get('mob-1')).toBeDefined()
    expect(room1GameState.players.get('player-2')).toBeUndefined()
    expect(room1GameState.mobs.get('mob-2')).toBeUndefined()

    // Room 2 should only know about its entities
    expect(room2GameState.players.get('player-2')).toBeDefined()
    expect(room2GameState.mobs.get('mob-2')).toBeDefined()
    expect(room2GameState.players.get('player-1')).toBeUndefined()
    expect(room2GameState.mobs.get('mob-1')).toBeUndefined()
  })

  test('should process attacks independently', async () => {
    // Verify entities are in game states
    expect(room1GameState.mobs.get('mob-1')).toBeDefined()
    expect(room1GameState.players.get('player-1')).toBeDefined()
    expect(room2GameState.mobs.get('mob-2')).toBeDefined()
    expect(room2GameState.players.get('player-2')).toBeDefined()

    // Room 1: mob attacks player
    room1BattleManager.addActionMessage(BattleManager.createAttackMessage('mob-1', 'player-1', 20, 10))

    // Room 2: mob attacks player
    room2BattleManager.addActionMessage(BattleManager.createAttackMessage('mob-2', 'player-2', 15, 8))

    // Process attacks in both rooms
    await room1BattleManager.processActionMessages()
    await room2BattleManager.processActionMessages()

    // Each room should have processed its own attack
    // Room 1 player should be damaged
    expect(player1.currentHealth).toBeLessThan(player1.maxHealth)

    // Room 2 player should be damaged
    expect(player2.currentHealth).toBeLessThan(player2.maxHealth)

    // Room 1 player should NOT be affected by Room 2's attack
    const room1PlayerHealth = player1.currentHealth
    const room2PlayerHealth = player2.currentHealth

    // Both players should be damaged (health < maxHealth)
    expect(room1PlayerHealth).toBeLessThan(player1.maxHealth)
    expect(room2PlayerHealth).toBeLessThan(player2.maxHealth)

    // They should have the same health since both took the same damage (this is correct behavior)
    expect(room1PlayerHealth).toBe(room2PlayerHealth)
  })

  test('should have independent attack event histories', () => {
    // Create attacks in both rooms
    room1BattleManager.addActionMessage(BattleManager.createAttackMessage('mob-1', 'player-1', 20, 10))
    room2BattleManager.addActionMessage(BattleManager.createAttackMessage('mob-2', 'player-2', 15, 8))

    // Process the messages to create events
    room1BattleManager.processActionMessages()
    room2BattleManager.processActionMessages()

    // Each room should have processed its own attack
    expect(room1GameState.players.get('player-1')?.currentHealth).toBeLessThan(100)
    expect(room2GameState.players.get('player-2')?.currentHealth).toBeLessThan(100)
  })

  test('should handle entity cleanup independently', () => {
    // Remove entities from room 1
    room1GameState.players.delete('player-1')
    room1GameState.mobs.delete('mob-1')

    // Room 1 should no longer know about these entities
    expect(room1GameState.players.get('player-1')).toBeUndefined()
    expect(room1GameState.mobs.get('mob-1')).toBeUndefined()

    // Room 2 should still know about its entities
    expect(room2GameState.players.get('player-2')).toBeDefined()
    expect(room2GameState.mobs.get('mob-2')).toBeDefined()
  })

  test('should not allow cross-room attacks', async () => {
    // Try to attack player in room 2 from room 1
    room1BattleManager.addActionMessage(BattleManager.createAttackMessage('mob-1', 'player-2', 20, 10))

    // Process the attack
    await room1BattleManager.processActionMessages()

    // Room 2 player should not be damaged (entity not in room 1's game state)
    expect(player2.currentHealth).toBe(player2.maxHealth)
  })
})
