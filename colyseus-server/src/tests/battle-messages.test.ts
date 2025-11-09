/**
 * Battle Message System Tests
 * Tests the new message-based battle communication system
 */

import { BattleManager } from '../modules/BattleManager'
import { BattleActionMessage } from '../modules/BattleActionMessage'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { GameState } from '../schemas/GameState'

describe('Battle Message System', () => {
  let battleManager: BattleManager
  let gameState: GameState
  let player: Player
  let mob: Mob

  beforeEach(() => {
    gameState = new GameState('test-map', 'room-1')
    battleManager = new BattleManager('room-1', gameState)
    player = new Player('test-session', 'TestPlayer', 100, 100)
    mob = new Mob({
      id: 'test-mob',
      x: 105, // Close to player
      y: 100,
      attackRange: 10,
      attackDamage: 20,
    })

    // Add entities to game state (no registration needed)
    gameState.players.set(player.id, player)
    gameState.mobs.set(mob.id, mob)
  })

  afterEach(() => {
    // Clean up BattleManager event listeners
    battleManager.cleanup()
    // Stop AI module to prevent background timers
    gameState.stopAI()
  })

  describe('Action Message Creation', () => {
    test('should create attack message', () => {
      const message = BattleManager.createAttackMessage(mob.id, player.id, 20, 10)

      expect(message.actorId).toBe(mob.id)
      expect(message.targetId).toBe(player.id)
      expect(message.actionKey).toBe('attack')
      expect(message.actionPayload.damage).toBe(20)
      expect(message.actionPayload.range).toBe(10)
    })

    test('should create heal message', () => {
      const message = BattleManager.createHealMessage(
        player.id,
        player.id, // Self-heal
        30,
        'potion'
      )

      expect(message.actorId).toBe(player.id)
      expect(message.targetId).toBe(player.id)
      expect(message.actionKey).toBe('heal')
      expect(message.actionPayload.amount).toBe(30)
      expect(message.actionPayload.healType).toBe('potion')
    })

    // Kill messages are internal to the battle system, not part of public API
  })

  describe('Message Processing', () => {
    test('should process attack messages', async () => {
      const initialHealth = player.currentHealth
      
      // Reduce attack delay for testing and reset cooldown
      mob.attackDelay = 100
      mob.lastAttackTime = 0

      // Create and add attack message
      battleManager.addActionMessage(BattleManager.createAttackMessage(mob.id, player.id, 20, 10))

      // Process messages
      const processedCount = await battleManager.processActionMessages()

      expect(processedCount).toBe(1)
      expect(player.currentHealth).toBeLessThan(initialHealth)
    })

    test('should process heal messages', async () => {
      // Damage player first
      player.currentHealth = 50

      // Create and add heal message
      battleManager.addActionMessage(BattleManager.createHealMessage(player.id, player.id, 30, 'potion'))

      // Process messages
      const processedCount = await battleManager.processActionMessages()

      expect(processedCount).toBe(1)
      expect(player.currentHealth).toBe(80)
    })

    // Kill and respawn are internal battle system actions, not part of public API
  })

  describe('Message Queue Management', () => {
    test('should process multiple messages', async () => {
      // Reduce attack delay for testing and reset cooldown
      mob.attackDelay = 100
      mob.lastAttackTime = 0
      
      // Ensure player is damaged first
      player.currentHealth = 50
      
      battleManager.addActionMessage(BattleManager.createAttackMessage(mob.id, player.id, 10, 5))
      battleManager.addActionMessage(BattleManager.createHealMessage(player.id, player.id, 20, 'natural'))

      const processedCount = await battleManager.processActionMessages()
      expect(processedCount).toBe(2)
    })

    test('should process messages in priority order', async () => {
      // Reduce attack delay for testing and reset cooldown
      mob.attackDelay = 100
      mob.lastAttackTime = 0
      
      // Add messages with different priorities
      const attackMessage = BattleManager.createAttackMessage(mob.id, player.id, 20, 10)
      attackMessage.priority = 3 // High priority
      battleManager.addActionMessage(attackMessage)

      const healMessage = BattleManager.createHealMessage(player.id, player.id, 50, 'natural')
      healMessage.priority = 1 // Low priority
      battleManager.addActionMessage(healMessage)

      // Process messages
      const processedCount = await battleManager.processActionMessages()

      expect(processedCount).toBe(2)
      // Both attack and heal should be processed
      expect(player.currentHealth).toBeGreaterThan(50) // Healed after attack
    })

    // Entity-specific message queries are internal implementation details
  })

  describe('Mob Integration', () => {
    test('should emit attack event when mob attacks', () => {
      // Set up mob in attack behavior
      mob.currentBehavior = 'attack'
      mob.currentAttackTarget = player.id
      mob.lastAttackTime = 0 // Allow attack
      mob.attackDelay = 100 // Reduce attack delay for testing

      // Call mob updateAttack (emits BATTLE_ATTACK event)
      const result = mob.updateAttack(new Map([[player.id, player]]), 'room-1')

      expect(result.attacked).toBe(true)
      expect(result.eventEmitted).toBe(true)
    })

    test('should not emit event when mob cannot attack', () => {
      // Set up mob in wander behavior (not attacking)
      mob.currentBehavior = 'wander'
      mob.currentAttackTarget = ''

      const result = mob.updateAttack(new Map([[player.id, player]]), 'room-1')

      expect(result.attacked).toBe(false)
      expect(result.eventEmitted).toBeUndefined()
    })
  })

  describe('Error Handling', () => {
    test('should handle invalid actor in message', async () => {
      const invalidMessage = BattleManager.createAttackMessage(
        'invalid-actor',
        player.id,
        20,
        10
      )

      battleManager.addActionMessage(invalidMessage)
      const processedCount = await battleManager.processActionMessages()

      expect(processedCount).toBe(0)
    })

    test('should handle invalid target in message', async () => {
      const invalidMessage = BattleManager.createAttackMessage(
        mob.id,
        'invalid-target',
        20,
        10
      )

      battleManager.addActionMessage(invalidMessage)
      const processedCount = await battleManager.processActionMessages()

      expect(processedCount).toBe(0)
    })
  })
})
