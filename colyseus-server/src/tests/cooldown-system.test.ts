import { describe, it, expect, beforeEach } from 'bun:test'
import { Player } from '../schemas/Player'
import { PlayerCombatSystem } from '../systems/PlayerCombatSystem'

describe('Cooldown System', () => {
  let player: Player
  let combatSystem: PlayerCombatSystem

  beforeEach(() => {
    // Mock player with minimal required props
    player = new Player('test-session', 'Test Player')
    combatSystem = (player as any).combatSystem // Access private system via any cast or changing visibility
  })

  it('should allow action when no cooldowns are active', () => {
    const canPerform = player.canPerformAction(['skill_dash'])
    expect(canPerform).toBe(true)
  })

  it('should block action when specific cooldown is active', () => {
    // Set verify action sets cooldown
    player.performAction({ 'skill_dash': 500 })
    
    // Check immediately
    const canPerform = player.canPerformAction(['skill_dash'])
    expect(canPerform).toBe(false)
  })

  it('should allow independent cooldowns (Multi-Channel)', () => {
    // Set Dash Cooldown
    player.performAction({ 'skill_dash': 500 })
    
    // Magic should still be usable (different key)
    const canUseMagic = player.canPerformAction(['skill_fireball'])
    expect(canUseMagic).toBe(true)
  })

  it('should block shared cooldown keys', () => {
    // Set Global Magic CD
    player.performAction({ 'global_magic_cd': 1000 })
    
    // Fireball checks global_magic_cd
    const canUseFireball = player.canPerformAction(['skill_fireball', 'global_magic_cd'])
    expect(canUseFireball).toBe(false)
    
    // Dash checks only skill_dash, so it should be fine
    const canUseDash = player.canPerformAction(['skill_dash'])
    expect(canUseDash).toBe(true)
  })
})
