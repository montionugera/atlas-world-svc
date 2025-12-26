import { Mob } from '../schemas/Mob'
import { AIModule } from '../ai/AIModule'
import { AIWorldInterface } from '../ai/AIWorldInterface'
import { GameState } from '../schemas/GameState'
import { Player } from '../schemas/Player'
import { ChaseBehavior, AttackBehavior } from '../ai/behaviors/AgentBehaviors'

describe('Mob-centric AI decisions', () => {
  let aiModule: AIModule
  let gameState: GameState

  beforeEach(() => {
    gameState = new GameState()
    aiModule = gameState.aiModule
  })

  test('decideBehavior selects attack within 20 and locks briefly', () => {
    const mob = new Mob({ id: 'm1', x: 200, y: 150, vx: 0, vy: 0 }) // Center of world to avoid boundary detection
    mob.attackRange = 1.5 // Set attack range for melee
    mob.radius = 4
    gameState.mobs.set(mob.id, mob)
    aiModule.registerMob(mob, {})
    const now = performance.now()

    // Create a test player (close to mob for attack range - within effective range)
    const testPlayer = new Player('player1', 'TestPlayer', 205, 150) // 5 units away, within melee range (1.5 + 4 + 1.3 = 6.8)
    gameState.players.set('player1', testPlayer)

    // Use AIWorldInterface to build proper environment
    const envClose = gameState.worldInterface.buildMobEnvironment(mob, 50)
    // Explicitly set nearBoundary to false (mob is at center, not near boundary)
    envClose.nearBoundary = false

    const decision = aiModule.decideBehavior(mob, envClose)
    mob.applyBehaviorDecision(decision)
    expect(decision.behavior).toBe('attack')
    expect(mob.currentBehavior).toBe('attack')
    // Current implementation uses 500ms lock
    expect(mob.behaviorLockedUntil).toBeGreaterThanOrEqual(now + 400)
  })

  test('locked behavior remains attack even if player moves away briefly', () => {
    const mob = new Mob({ id: 'm2', x: 200, y: 150, vx: 0, vy: 0 }) // Center of world to avoid boundary detection
    mob.attackRange = 1.5 // Set attack range for melee
    mob.radius = 4
    gameState.mobs.set(mob.id, mob)
    aiModule.registerMob(mob, {})
    
    // Enter attack state (very close to mob - same position, distance = 0)
    const testPlayer1 = new Player('player1', 'TestPlayer', 200, 150)
    gameState.players.set('player1', testPlayer1)
    const envClose = gameState.worldInterface.buildMobEnvironment(mob, 50)
    // Explicitly set nearBoundary to false (mob is at center, not near boundary)
    envClose.nearBoundary = false
    const decision1 = aiModule.decideBehavior(mob, envClose)
    mob.applyBehaviorDecision(decision1)
    const lockedUntil = mob.behaviorLockedUntil
    expect(mob.currentBehavior).toBe('attack')
    expect(lockedUntil).toBeGreaterThan(0)

    // Now far away but still within lock window
    testPlayer1.x = 300
    testPlayer1.y = 150
    const envFar = gameState.worldInterface.buildMobEnvironment(mob, 50)
    // Explicitly set nearBoundary to false (mob is at center, not near boundary)
    envFar.nearBoundary = false
    const decision2 = aiModule.decideBehavior(mob, envFar)
    mob.applyBehaviorDecision(decision2)
    expect(decision2.behavior).toBe('attack')
    expect(mob.behaviorLockedUntil).toBe(lockedUntil)
  })

  test('behaviors produce correct desired velocity', () => {
    const mob = new Mob({ id: 'm3', x: 0, y: 0, vx: 0, vy: 0 })
    
    // Test ChaseBehavior
    const chaseBehavior = new ChaseBehavior()
    const chaseEnv = {
      nearestPlayer: { x: 5, y: 0, id: 'player1', radius: 1.3 } as any,
      distanceToNearestPlayer: 5,
      nearBoundary: false,
      worldBounds: { width: 400, height: 300 }
    }
    
    const chaseDecision = chaseBehavior.getDecision(mob, chaseEnv, Date.now())
    const chaseDesired = chaseDecision.desiredVelocity || { x: 0, y: 0 }
    
    expect(chaseDesired.x).toBeGreaterThan(0)
    expect(Math.abs(chaseDesired.y)).toBeLessThan(1e-6)
    // For chase, speed is limited by maxStoppingSpeed when close to target
    expect(Math.hypot(chaseDesired.x, chaseDesired.y)).toBeCloseTo(3, 1)

    // Test AttackBehavior
    const attackBehavior = new AttackBehavior()
    mob.attackRange = 1.5 // MOB_STATS.attackRange
    mob.radius = 4
    
    // Test: outside melee range (10 units > 6.8 melee range with player radius 1.3) - should move closer
    const attackEnvFar = {
      nearestPlayer: { x: 10, y: 0, id: 'player1', radius: 1.3 } as any,
      distanceToNearestPlayer: 10,
      nearBoundary: false,
      worldBounds: { width: 400, height: 300 }
    }
    
    const attackDecisionFar = attackBehavior.getDecision(mob, attackEnvFar, Date.now())
    const attackDesiredFar = attackDecisionFar.desiredVelocity || { x: 0, y: 0 }
    
    expect(attackDesiredFar.x).toBeGreaterThan(0) // Should move toward player
    expect(Math.abs(attackDesiredFar.y)).toBeLessThan(1e-6)
    
    // Test: within melee range (5 units < 6.8 melee range with player radius 1.3) - should stop
    const attackEnvClose = {
      nearestPlayer: { x: 5, y: 0, id: 'player1', radius: 1.3 } as any,
      distanceToNearestPlayer: 5,
      nearBoundary: false,
      worldBounds: { width: 400, height: 300 }
    }
    
    const attackDecisionClose = attackBehavior.getDecision(mob, attackEnvClose, Date.now())
    const attackDesiredClose = attackDecisionClose.desiredVelocity || { x: 0, y: 0 }
    
    expect(attackDesiredClose.x).toBe(0)
    expect(attackDesiredClose.y).toBe(0)
  })

  test('decideBehavior picks avoidBoundary when near edge', () => {
    const mob = new Mob({ id: 'm4', x: 5, y: 5, vx: 0, vy: 0 })
    gameState.mobs.set(mob.id, mob)
    aiModule.registerMob(mob, {})
    
    const env = gameState.worldInterface.buildMobEnvironment(mob, 50)
    // Override nearBoundary for test
    env.nearBoundary = true
    const decision = aiModule.decideBehavior(mob, env)
    mob.applyBehaviorDecision(decision)
    expect(decision.behavior).toBe('avoidBoundary')
    expect(mob.tag).toBe('avoidBoundary')
  })

  test('decideBehavior defaults to wander when nothing else applies', () => {
    const mob = new Mob({ id: 'm5', x: 200, y: 150, vx: 1, vy: 0 }) // Center of world
    gameState.mobs.set(mob.id, mob)
    aiModule.registerMob(mob, {})
    
    // Use AIWorldInterface to build proper environment
    const env = gameState.worldInterface.buildMobEnvironment(mob, 50)
    // Explicitly set nearBoundary to false
    env.nearBoundary = false
    const decision = aiModule.decideBehavior(mob, env)
    mob.applyBehaviorDecision(decision)
    expect(decision.behavior).toBe('wander')
    expect(mob.tag).toBe('wander')
  })

  test('mobs should not attack dead players', () => {
    const mob = new Mob({ id: 'm6', x: 200, y: 150, vx: 0, vy: 0 })
    mob.attackRange = 1.5
    mob.radius = 4
    gameState.mobs.set(mob.id, mob)
    aiModule.registerMob(mob, {})

    // Create a dead player very close to mob (within attack range)
    const deadPlayer = new Player('dead-player', 'DeadPlayer', 205, 150)
    deadPlayer.die() // Kill the player
    expect(deadPlayer.isAlive).toBe(false)
    gameState.players.set('dead-player', deadPlayer)

    // Build environment - should not include dead player
    const env = gameState.worldInterface.buildMobEnvironment(mob, 50)
    env.nearBoundary = false

    // Mob should not choose attack behavior for dead player
    const decision = aiModule.decideBehavior(mob, env)
    mob.applyBehaviorDecision(decision)
    
    expect(decision.behavior).not.toBe('attack')
    expect(decision.currentAttackTarget).toBe('')
    // Should default to wander since no alive players nearby
    expect(decision.behavior).toBe('wander')
  })

  test('mobs should not chase dead players', () => {
    const mob = new Mob({ id: 'm7', x: 200, y: 150, vx: 0, vy: 0 })
    gameState.mobs.set(mob.id, mob)
    aiModule.registerMob(mob, {})

    // Create a dead player within chase range
    const deadPlayer = new Player('dead-player', 'DeadPlayer', 210, 150) // 10 units away
    deadPlayer.die()
    expect(deadPlayer.isAlive).toBe(false)
    gameState.players.set('dead-player', deadPlayer)

    const env = gameState.worldInterface.buildMobEnvironment(mob, 50)
    env.nearBoundary = false

    const decision = aiModule.decideBehavior(mob, env)
    mob.applyBehaviorDecision(decision)

    expect(decision.behavior).not.toBe('chase')
    expect(decision.currentChaseTarget).toBe('')
    expect(decision.behavior).toBe('wander')
  })

  test('mobs should switch from attack to wander when player dies', () => {
    const mob = new Mob({ id: 'm8', x: 200, y: 150, vx: 0, vy: 0 })
    mob.attackRange = 1.5
    mob.radius = 4
    gameState.mobs.set(mob.id, mob)
    aiModule.registerMob(mob, {})

    // Create alive player within attack range
    const player = new Player('player1', 'TestPlayer', 205, 150)
    gameState.players.set('player1', player)

    // Mob should attack alive player
    let env = gameState.worldInterface.buildMobEnvironment(mob, 50)
    env.nearBoundary = false
    let decision = aiModule.decideBehavior(mob, env)
    mob.applyBehaviorDecision(decision)
    expect(decision.behavior).toBe('attack')
    expect(mob.currentBehavior).toBe('attack')

    // Kill the player
    player.die()
    expect(player.isAlive).toBe(false)

    // Clear behavior lock to allow immediate switch (simulating lock expiration)
    mob.behaviorLockedUntil = 0

    // Rebuild environment - should not see dead player
    env = gameState.worldInterface.buildMobEnvironment(mob, 50)
    env.nearBoundary = false
    decision = aiModule.decideBehavior(mob, env)
    mob.applyBehaviorDecision(decision)

    // Should switch to wander, not continue attacking
    expect(decision.behavior).toBe('wander')
    expect(mob.currentBehavior).toBe('wander')
    expect(decision.currentAttackTarget).toBe('')
    // Verify dead player is not in environment
    expect(env.nearestPlayer).toBeNull()
  })
})
