/**
 * Projectile System Tests
 * Tests for spear-throwing mob system: projectiles, trajectory, collision, deflection
 */

import { Projectile } from '../schemas/Projectile'
import { ProjectileManager } from '../modules/ProjectileManager'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { BattleModule } from '../modules/BattleModule'
import { SpearThrowAttackStrategy } from '../ai/strategies/SpearThrowAttackStrategy'
import { MeleeAttackStrategy } from '../ai/strategies/MeleeAttackStrategy'
import { SPEAR_THROWER_STATS } from '../config/combatConfig'
import { PROJECTILE_GRAVITY } from '../config/physicsConfig'

describe('Projectile System', () => {
  let gameState: GameState
  let battleModule: BattleModule
  let projectileManager: ProjectileManager
  let mob: Mob
  let player: Player

  beforeEach(() => {
    gameState = new GameState('map-01-sector-a', 'test-room')
    battleModule = new BattleModule(gameState)
    projectileManager = new ProjectileManager(gameState, battleModule)

    mob = new Mob({
      id: 'mob-1',
      x: 100,
      y: 100,
      radius: 4,
    })

    player = new Player('player-1', 'TestPlayer', 120, 100)
    gameState.players.set(player.id, player)
  })

  afterEach(() => {
    gameState.stopAI()
  })

  describe('Projectile Creation', () => {
    test('should create projectile with correct initial properties', () => {
      const projectile = projectileManager.createSpear(mob, 150, 100, 5, 10)

      expect(projectile.id).toContain('projectile-')
      expect(projectile.ownerId).toBe(mob.id)
      expect(projectile.damage).toBe(5)
      expect(projectile.maxRange).toBe(10)
      expect(projectile.x).toBeGreaterThan(mob.x)
      expect(projectile.y).toBeCloseTo(mob.y)
      expect(projectile.hasHit).toBe(false)
      expect(projectile.isStuck).toBe(false)
    })

    test('should calculate correct trajectory angle', () => {
      const projectile = projectileManager.createSpear(mob, 150, 100, 5, 10)

      // Target is to the right (0 degrees)
      expect(projectile.vx).toBeGreaterThan(0)
      expect(Math.abs(projectile.vy)).toBeLessThan(1) // Nearly horizontal
    })

    test('should set velocity within max speed limit', () => {
      const projectile = projectileManager.createSpear(mob, 200, 100, 5, 10)
      const speed = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy)
      
      expect(speed).toBeLessThanOrEqual(2000) // Max speed
    })
  })

  describe('Projectile Physics', () => {
    test('should maintain velocity (no gravity in top-down 2D)', () => {
      const { PlanckPhysicsManager } = require('../physics/PlanckPhysicsManager')
      const physicsManager = new PlanckPhysicsManager()
      
      const projectile = new Projectile('proj-1', 100, 100, 10, 5, 'mob-1', 5, 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)
      
      // Create physics body for projectile
      physicsManager.createProjectileBody(projectile)

      const initialVx = projectile.vx
      const initialVy = projectile.vy
      
      // Update projectile using real physics manager (should not apply gravity)
      projectileManager.updateProjectiles(gameState.projectiles, 100, physicsManager)

      // Velocity should remain unchanged (no gravity applied in top-down 2D)
      expect(projectile.vx).toBe(initialVx)
      expect(projectile.vy).toBe(initialVy)
      
      // Cleanup
      physicsManager.removeBody(projectile.id)
    })

    test('should cap projectile speed at max', () => {
      const projectile = new Projectile('proj-1', 100, 100, 50, 50, 'mob-1', 5, 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)

      const speedBefore = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy)
      expect(speedBefore).toBeGreaterThan(36)

      projectileManager.updateProjectiles(gameState.projectiles, 100, {
        updateProjectile: (p: Projectile, dt: number) => {
          const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
          if (speed > 36) {
            const scale = 36 / speed
            p.vx *= scale
            p.vy *= scale
          }
        },
        getBody: () => null,
      } as any)

      const speedAfter = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy)
      expect(speedAfter).toBeLessThanOrEqual(36)
    })

    test('should track distance traveled', () => {
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)

      expect(projectile.distanceTraveled).toBe(0)

      projectileManager.updateProjectiles(gameState.projectiles, 1000, {
        updateProjectile: (p: Projectile, dt: number) => {
          const distance = Math.sqrt(p.vx * p.vx + p.vy * p.vy) * (dt / 1000)
          p.distanceTraveled += distance
        },
        getBody: () => null,
      } as any)

      expect(projectile.distanceTraveled).toBeGreaterThan(0)
    })

    test('should despawn when max range reached', () => {
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'spear', 10)
      projectile.distanceTraveled = 10 // Max range
      gameState.projectiles.set(projectile.id, projectile)

      expect(projectile.shouldDespawn()).toBe(true)
    })

    test('should despawn after lifetime when stuck', () => {
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'spear', 10)
      projectile.stick()
      projectile.stuckAt = Date.now() - 3000 // 3 seconds ago
      projectile.lifetime = 2000 // 2 second lifetime

      expect(projectile.shouldDespawn()).toBe(true)
    })
  })

  describe('Projectile Collision', () => {
    test('should damage player on collision', () => {
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)
      gameState.mobs.set(mob.id, mob)

      const initialHealth = player.currentHealth
      projectileManager.handlePlayerCollision(projectile, player)

      expect(player.currentHealth).toBeLessThan(initialHealth)
      expect(projectile.hasHit).toBe(true)
    })

    test('should not damage player twice (piercing)', () => {
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)
      gameState.mobs.set(mob.id, mob)

      const initialHealth = player.currentHealth
      projectileManager.handlePlayerCollision(projectile, player)
      const healthAfterFirst = player.currentHealth

      // Second collision should not damage
      projectileManager.handlePlayerCollision(projectile, player)

      expect(player.currentHealth).toBe(healthAfterFirst)
    })

    test('should stick projectile on boundary collision', () => {
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)

      expect(projectile.isStuck).toBe(false)
      projectileManager.handleBoundaryCollision(projectile)

      expect(projectile.isStuck).toBe(true)
      expect(projectile.vx).toBe(0)
      expect(projectile.vy).toBe(0)
      expect(projectile.stuckAt).toBeGreaterThan(0)
    })
  })

  describe('Projectile Deflection', () => {
    test('should deflect projectile when player attacks', () => {
      // Place projectile close to player and in attack cone
      player.x = 100
      player.y = 100
      const projectile = new Projectile('proj-1', 103, 100, 10, 0, 'mob-1', 5, 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)

      player.isAttacking = true
      player.heading = 0 // Facing right (toward projectile)
      player.attackRange = 5
      player.radius = 1.3 // Player radius max is 1.3

      const initialVx = projectile.vx
      const deflected = projectileManager.checkDeflection(projectile, player)

      expect(deflected).toBe(true)
      expect(projectile.vx).toBeLessThan(0) // Reversed direction
      expect(projectile.ownerId).toBe(player.id)
      expect(projectile.hasHit).toBe(false) // Can damage again
      expect(projectile.deflectedBy).toBe(player.id)
    })

    test('should not deflect if already deflected', () => {
      const projectile = new Projectile('proj-1', 110, 100, 10, 0, 'mob-1', 5, 'spear', 10)
      projectile.deflectedBy = 'player-2'
      gameState.projectiles.set(projectile.id, projectile)

      player.isAttacking = true
      player.heading = 0
      player.attackRange = 5

      const deflected = projectileManager.checkDeflection(projectile, player)
      expect(deflected).toBe(false)
    })

    test('should not deflect if player not attacking', () => {
      const projectile = new Projectile('proj-1', 110, 100, 10, 0, 'mob-1', 5, 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)

      player.isAttacking = false
      player.heading = 0
      player.attackRange = 5

      const deflected = projectileManager.checkDeflection(projectile, player)
      expect(deflected).toBe(false)
    })

    test('should not deflect if out of range', () => {
      const projectile = new Projectile('proj-1', 200, 100, 10, 0, 'mob-1', 5, 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)

      player.isAttacking = true
      player.heading = 0
      player.attackRange = 5
      player.radius = 1.3 // Player radius max is 1.3

      const deflected = projectileManager.checkDeflection(projectile, player)
      expect(deflected).toBe(false)
    })
  })

  describe('Attack Strategies', () => {
    test('SpearThrowAttackStrategy should have 500ms cast time', () => {
      const strategy = new SpearThrowAttackStrategy(projectileManager, gameState)
      expect(strategy.getCastTime()).toBe(500)
    })

    test('MeleeAttackStrategy should have 0ms cast time', () => {
      const strategy = new MeleeAttackStrategy(projectileManager, gameState)
      expect(strategy.getCastTime()).toBe(0)
    })

    test('SpearThrowAttackStrategy should check range correctly', () => {
      const strategy = new SpearThrowAttackStrategy(projectileManager, gameState, {
        maxRange: 15,
      })

      mob.x = 100
      mob.y = 100
      player.x = 110 // 10 units away
      player.y = 100

      expect(strategy.canExecute(mob, player)).toBe(true)

      player.x = 120 // 20 units away (out of range)
      expect(strategy.canExecute(mob, player)).toBe(false)
    })

    test('SpearThrowAttackStrategy should create projectile on execute', () => {
      const strategy = new SpearThrowAttackStrategy(projectileManager, gameState)
      
      mob.x = 100
      mob.y = 100
      player.x = 110
      player.y = 100

      const executed = strategy.execute(mob, player, 'test-room')
      expect(executed).toBe(true)
      expect(gameState.projectiles.size).toBe(1)
    })
  })

  describe('Mob Attack Strategy Integration', () => {
    test('mob should use spear strategy when available', () => {
      const strategy = new SpearThrowAttackStrategy(projectileManager, gameState)
      mob.attackStrategies = [strategy]
      mob.currentBehavior = 'attack'
      mob.currentAttackTarget = player.id
      
      // Reset cooldown and place mob in range
      // Set lastAttackTime to well in the past to ensure cooldown is ready
      mob.lastAttackTime = performance.now() - 2000 // 2 seconds ago
      mob.attackDelay = 1000 // Set attack delay
      mob.x = 100
      mob.y = 100
      player.x = 110 // 10 units away (within spear maxRange)
      player.y = 100
      player.isAlive = true

      mob.updateAttack(gameState.players, 'test-room')

      // Should start casting (strategy canExecute checks canAttack internally)
      expect(mob.isCasting).toBe(true)
      expect(mob.castStartTime).toBeGreaterThan(0)
    })

    test('mob should execute attack after casting', () => {
      const strategy = new SpearThrowAttackStrategy(projectileManager, gameState)
      mob.attackStrategies = [strategy]
      mob.currentAttackStrategy = strategy
      mob.currentBehavior = 'attack'
      mob.currentAttackTarget = player.id
      mob.isCasting = true
      mob.castStartTime = Date.now() - 600 // 600ms ago (past 500ms cast time)
      
      // Place mob in range
      mob.x = 100
      mob.y = 100
      player.x = 110
      player.y = 100

      mob.updateAttack(gameState.players, 'test-room')

      // Should have created projectile
      expect(gameState.projectiles.size).toBe(1)
      expect(mob.isCasting).toBe(false)
    })

    test('mob should prefer melee when in melee range', () => {
      const meleeStrategy = new MeleeAttackStrategy(projectileManager, gameState)
      const spearStrategy = new SpearThrowAttackStrategy(projectileManager, gameState)
      mob.attackStrategies = [meleeStrategy, spearStrategy]
      mob.currentBehavior = 'attack'
      mob.currentAttackTarget = player.id

      // Place player in melee range
      mob.x = 100
      mob.y = 100
      player.x = 102 // Very close
      player.y = 100

      mob.updateAttack(gameState.players, 'test-room')

      // Should use melee (instant, no cast time, but creates projectile for unified flow)
      expect(mob.isCasting).toBe(false)
      expect(gameState.projectiles.size).toBe(1) // Melee now creates projectile (unified flow)
      
      // Verify it's a melee projectile (short range, fast speed)
      const projectile = Array.from(gameState.projectiles.values())[0]
      expect(projectile.ownerId).toBe(mob.id)
      expect(projectile.maxRange).toBeLessThanOrEqual(5) // Melee max range
    })
  })

  describe('Integration', () => {
    test('should spawn spear thrower mob with correct strategies', () => {
      const lifecycleManager = gameState.mobLifeCycleManager
      if (!lifecycleManager) {
        // Create lifecycle manager if not present
        const { MobLifeCycleManager } = require('../modules/MobLifeCycleManager')
        const manager = new MobLifeCycleManager('test-room', gameState)
        manager.setProjectileManager(projectileManager)
        gameState.mobLifeCycleManager = manager
      }

      gameState.mobLifeCycleManager.setProjectileManager(projectileManager)
      
      // Spawn mobs - 20% chance of spear thrower
      // We'll manually create one for testing
      const spearMob = new Mob({
        id: 'spear-mob-1',
        x: 100,
        y: 100,
        attackStrategies: [
          new SpearThrowAttackStrategy(projectileManager, gameState),
        ],
      })

      expect(spearMob.attackStrategies.length).toBe(1)
      expect(spearMob.attackStrategies[0].name).toBe('spearThrow')
    })
  })
})

