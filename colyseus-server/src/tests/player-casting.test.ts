
import { describe, it, expect, beforeEach } from 'bun:test'
import { ZoneEffectManager } from '../modules/ZoneEffectManager'
import { ZoneEffect } from '../schemas/ZoneEffect'
import { GameState } from '../schemas/GameState'
import { BattleModule } from '../modules/BattleModule'
import { Player } from '../schemas/Player'
import { SKILLS } from '../config/skills'

describe('Player Casting State Verification', () => {
  let gameState: GameState
  let battleModule: BattleModule
  let zoneManager: ZoneEffectManager
  let player: Player
  let target: Player

  beforeEach(() => {
    gameState = new GameState('test-map', 'room-1')
    battleModule = new BattleModule(gameState)
    zoneManager = new ZoneEffectManager(gameState, battleModule)
    
    player = new Player('player-1', 'Player 1', 100, 100)
    target = new Player('target-1', 'Target 1', 104, 100) // 4 units away
    
    gameState.players.set(player.id, player)
    gameState.players.set(target.id, target)
  })

  it('should set isCasting when creating a zone effect with cast time', () => {
      // 1000ms cast time
      const zone = zoneManager.createZoneEffect(
          100, 100, player.id, 'test_skill', 
          [], 5, 
          1000, 
          1000, 0
      )
      
      expect(player.isCasting).toBe(true)
      expect(player.castingUntil).toBeGreaterThan(Date.now())
      expect(player.castDuration).toBe(1000)
  })

  it('should prevent attack while casting', () => {
      // Manually set casting state
      player.isCasting = true
      player.input.attack = true
      
      // Mock mobs map
      const mobs = new Map<string, any>()
      
      const result = player.processAttackInput(mobs, 'room-1')
      
      expect(result).toBe(false)
  })
  
  it('should allow attack when not casting', () => {
      player.isCasting = false
      player.input.attack = true
      
      // Mock mobs map
      const mobs = new Map<string, any>()
      
      // Ensure cooldowns are clear
      player.canAttack = () => true; 
      
      const result = player.processAttackInput(mobs, 'room-1')
      
      // Might be true or false depending on target, but should pass the casting check
      // With no target it might still return true for "miss" animation if implemented
      // Checking logic: returns true if attack processed (even if no target found)
      expect(result).toBe(true)
  })

  it('should clear isCasting when cast completes', () => {
      const zone = zoneManager.createZoneEffect(
          100, 100, player.id, 'test_skill', 
          [], 5, 
          500,  // 500ms cast
          1000, 0
      )
      
      expect(player.isCasting).toBe(true)
      
      // Advance time > castTime
      // Mock Date.now by overriding or just wait? Bun test is fast, wait is bad.
      // We simulate update by manually setting timestamps
      const now = Date.now()
      zone.createdAt = now - 600 // 600ms ago
      
      // Update zone manager
      const zones = new Map<string, ZoneEffect>()
      zones.set(zone.id, zone)
      zoneManager.update(zones)
      
      expect(player.isCasting).toBe(false)
      expect(zone.isActive).toBe(true)
  })

  it('should clear isCasting when interrupted', () => {
      const zone = zoneManager.createZoneEffect(
          100, 100, player.id, 'test_skill', 
          [], 5, 
          1000, 
          1000, 0
      )
      
      expect(player.isCasting).toBe(true)
      
      // Stun player
      battleModule.applyStatusEffect(player, 'stun', 2000)
      
      // Advance time > castTime to trigger check
      // Even if time hasn't passed, interruption check happens in update
      // But update logic only checks interruption if (now - createdAt >= castTime) ?? 
      // Wait, let's check ZoneEffectManager logic:
      // if (!zone.isActive) { if (now - zone.createdAt >= zone.castTime) { ... check interruption ... } }
      
      // Ah, implementation flaw check: 
      // If we are interrupted MID-CAST, we should probably check immediately?
      // OR do we wait until cast FINISHES to say "Interrupted"?
      // Current logic in ZoneEffectManager:
      // It checks interruption ONLY when cast timer completes.
      // "if (now - zone.createdAt >= zone.castTime) { ... if stunned ... INTERRUPT }"
      
      // So verify strictly with that logic logic:
      const now = Date.now()
      zone.createdAt = now - 1100 // Finished cast duration
      
      const zones = new Map<string, ZoneEffect>()
      zones.set(zone.id, zone)
      zoneManager.update(zones)
      
      expect(player.isCasting).toBe(false)
      expect(zones.has(zone.id)).toBe(false) // Should be removed
  })
})
