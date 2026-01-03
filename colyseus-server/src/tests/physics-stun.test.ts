
import { describe, it, expect, beforeEach } from 'bun:test'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { GameState } from '../schemas/GameState'
import { Player } from '../schemas/Player'
import { BattleStatus } from '../schemas/BattleStatus'
import * as planck from 'planck'

describe('Physics Manager Stun Integration', () => {
  let physicsManager: PlanckPhysicsManager
  let player: Player
  let players: Map<string, Player>
  let mobs: Map<string, any>

  beforeEach(() => {
    physicsManager = new PlanckPhysicsManager()
    player = new Player('p1', 'Player 1', 100, 100)
    
    // Setup physics body
    physicsManager.createPlayerBody(player)
    
    players = new Map()
    players.set(player.id, player)
    mobs = new Map()
  })

  it('should prevent movement when player is stunned', () => {
    // 1. Simulate Input
    player.input.setMovement(1, 0) // Moving Right
    
    // 2. Normal Update (Not Stunned)
    // Run multiple ticks to allow acceleration
    for (let i = 0; i < 5; i++) {
        physicsManager.update(16, players, mobs)
    }
    
    // Should have velocity
    expect(player.vx).toBeGreaterThan(0.1) 
    expect(player.isStunned).toBe(false)
    
    // 3. Apply Stun
    // Manually add status as we don't have BattleModule here
    const stunStatus = new BattleStatus('stun-1', 'stun', 2000)
    player.battleStatuses.set('stun', stunStatus)
    
    expect(player.isStunned).toBe(true)
    
    // 4. Update with Stun
    physicsManager.update(16, players, mobs)
    
    // Should stop
    expect(player.vx).toBe(0)
    expect(player.vy).toBe(0)
    
    const body = physicsManager.getBody(player.id)
    const vel = body!.getLinearVelocity()
    expect(vel.x).toBe(0)
    expect(vel.y).toBe(0)
  })

  it('should ignore new input while stunned', () => {
     // Apply Stun first
    const stunStatus = new BattleStatus('stun-1', 'stun', 2000)
    player.battleStatuses.set('stun', stunStatus)
    
    // Simulate Input
    player.input.setMovement(1, 0)
    
    physicsManager.update(16, players, mobs)
    
    expect(player.vx).toBe(0)
  })
})
