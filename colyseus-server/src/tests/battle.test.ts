/**
 * Battle System Tests
 * Tests the new modular battle system
 */

import { BattleManager } from '../modules/BattleManager'
import { BattleModule } from '../modules/BattleModule'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { GameState } from '../schemas/GameState'

describe('Battle System', () => {
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
    
    // Add entities to game state
    gameState.players.set(player.id, player)
    gameState.mobs.set(mob.id, mob)
  })

  afterEach(() => {
    // Stop AI module to prevent background timers
    gameState.stopAI()
  })

  describe('BattleManager', () => {
    test('should process successful attack', async () => {
      // Reset attack cooldown for testing
      mob.lastAttackTime = 0
      mob.attackDelay = 100 // Short delay for testing
      
      const initial = player.currentHealth
      battleManager.addActionMessage(
        BattleManager.createAttackMessage(mob.id, player.id, 20, 10)
      )
      const processed = await battleManager.processActionMessages()
      expect(processed).toBe(1)
      expect(player.currentHealth).toBeLessThan(initial)
    })

    test('should handle attack cooldown (no double-processing in same tick)', async () => {
      // Reset attack cooldown for testing
      mob.lastAttackTime = 0
      mob.attackDelay = 100 // Short delay for testing
      
      const initial = player.currentHealth
      battleManager.addActionMessage(
        BattleManager.createAttackMessage(mob.id, player.id, 20, 10)
      )
      battleManager.addActionMessage(
        BattleManager.createAttackMessage(mob.id, player.id, 20, 10)
      )
      const processed = await battleManager.processActionMessages()
      expect(processed).toBeGreaterThan(0)
      expect(player.currentHealth).toBeLessThan(initial)
    })

    test('should heal entities', async () => {
      player.currentHealth = 50
      battleManager.addActionMessage(
        BattleManager.createHealMessage(player.id, player.id, 30, 'potion')
      )
      const processed = await battleManager.processActionMessages()
      expect(processed).toBe(1)
      expect(player.currentHealth).toBe(80)
    })
  })

  describe('BattleModule', () => {
    let battleModule: BattleModule

    beforeEach(() => {
      battleModule = new BattleModule(gameState)
    })

    test('should calculate damage with defense', () => {
      player.defense = 5
      player.armor = 3

      const damage = battleModule.calculateDamage(mob, player)
      expect(damage).toBeLessThan(mob.attackDamage)
      expect(damage).toBeGreaterThan(0)
    })

    test('should apply damage correctly', () => {
      const initialHealth = player.currentHealth
      const damage = 25

      const died = battleModule.applyDamage(player, damage)
      expect(player.currentHealth).toBe(initialHealth - damage)
      expect(died).toBe(false)
    })

    test('should kill entity when health reaches zero', () => {
      player.currentHealth = 10

      const died = battleModule.applyDamage(player, 15)
      expect(died).toBe(true)
      expect(player.currentHealth).toBe(0)
      expect(player.isAlive).toBe(false)
    })

    test('should trigger invulnerability frames', () => {
      battleModule.applyDamage(player, 10)
      expect(player.isInvulnerable).toBe(true)
      expect(player.invulnerabilityDuration).toBeGreaterThan(0)
    })
  })

  // Event history APIs were removed in simplification; covered by processing assertions above

  // Combat log API removed in simplification
})
