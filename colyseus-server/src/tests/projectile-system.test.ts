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
import { SPEAR_THROWER_STATS, WEAPON_TYPES } from '../config/combatConfig'
import { PROJECTILE_GRAVITY } from '../config/physicsConfig'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'

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
      const projectile = projectileManager.createSpear(mob, 150, 100, 5, 'physical', 10)

      expect(projectile.id).toContain('projectile-')
      expect(projectile.ownerId).toBe(mob.id)
      expect(projectile.damage).toBe(5)
      expect(projectile.maxRange).toBe(10)
      expect(projectile.x).toBeGreaterThan(mob.x)
      expect(projectile.y).toBeCloseTo(mob.y)
      expect(projectile.hitTargets.size).toBe(0)
      expect(projectile.isStuck).toBe(false)
    })

    test('should calculate correct trajectory angle', () => {
      const projectile = projectileManager.createSpear(mob, 150, 100, 5, 'physical', 10)

      // Target is to the right (0 degrees)
      expect(projectile.vx).toBeGreaterThan(0)
      expect(Math.abs(projectile.vy)).toBeLessThan(1) // Nearly horizontal
    })

    test('should set velocity within max speed limit', () => {
      const projectile = projectileManager.createSpear(mob, 200, 100, 5, 'physical', 10)
      const speed = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy)
      
      expect(speed).toBeLessThanOrEqual(2000) // Max speed
    })
  })

  describe('Projectile Physics', () => {
    test('should maintain velocity (no gravity in top-down 2D)', () => {
      const physicsManager = new PlanckPhysicsManager()
      
      const projectile = new Projectile('proj-1', 100, 100, 10, 5, 'mob-1', 5, 'physical', 'spear', 10)
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
      const projectile = new Projectile('proj-1', 100, 100, 50, 50, 'mob-1', 5, 'physical', 'spear', 10)
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
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10)
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
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10)
      projectile.distanceTraveled = 10 // Max range
      gameState.projectiles.set(projectile.id, projectile)

      expect(projectile.shouldDespawn()).toBe(true)
    })

    test('should despawn after lifetime when stuck', () => {
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10)
      projectile.stick()
      projectile.stuckAt = Date.now() - 3000 // 3 seconds ago
      projectile.lifetime = 2000 // 2 second lifetime

      expect(projectile.shouldDespawn()).toBe(true)
    })

    test('should despawn when maxAirLifeMs elapsed while flying', () => {
      const projectile = new Projectile(
        'air-cap',
        0,
        0,
        1,
        0,
        'o',
        1,
        'physical',
        'melee',
        500,
        0.3,
        500,
        '',
        80
      )
      projectile.createdAt = Date.now() - 100
      expect(projectile.shouldDespawn()).toBe(true)

      const fresh = new Projectile(
        'air-cap2',
        0,
        0,
        1,
        0,
        'o',
        1,
        'physical',
        'melee',
        500,
        0.3,
        500,
        '',
        80
      )
      fresh.createdAt = Date.now() - 10
      expect(fresh.shouldDespawn()).toBe(false)
    })
  })

  describe('Projectile Collision', () => {
    test('should damage entity on collision', () => {
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)
      gameState.mobs.set(mob.id, mob)

      const initialHealth = player.currentHealth
      projectileManager.handleEntityCollision(projectile, player)

      expect(player.currentHealth).toBeLessThan(initialHealth)
      expect(projectile.hitTargets.size).toBeGreaterThan(0)
    })

    test('non-piercing projectile should only damage one entity', () => {
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)
      gameState.mobs.set(mob.id, mob)

      const initialHealth = player.currentHealth
      projectileManager.handleEntityCollision(projectile, player)
      const healthAfterFirst = player.currentHealth

      // Second collision should not damage
      projectileManager.handleEntityCollision(projectile, player)

      expect(player.currentHealth).toBe(healthAfterFirst)
    })

    test('piercing projectile should damage multiple different entities', () => {
      const projectile = new Projectile('proj-pierce', 100, 100, 10, 0, 'mob-1', 5, 'physical', 'melee', 10)
      projectile.piercing = true
      projectile.teamId = 'team-a'
      gameState.projectiles.set(projectile.id, projectile)
      gameState.mobs.set(mob.id, mob)

      const enemyMob1 = new Mob({ id: 'enemy-1', x: 105, y: 100 })
      enemyMob1.teamId = 'team-b'
      const enemyMob2 = new Mob({ id: 'enemy-2', x: 105, y: 105 })
      enemyMob2.teamId = 'team-b'
      
      gameState.mobs.set(enemyMob1.id, enemyMob1)
      gameState.mobs.set(enemyMob2.id, enemyMob2)

      const initialHealth1 = enemyMob1.currentHealth
      const initialHealth2 = enemyMob2.currentHealth

      projectileManager.handleEntityCollision(projectile, enemyMob1)
      projectileManager.handleEntityCollision(projectile, enemyMob2)

      expect(enemyMob1.currentHealth).toBeLessThan(initialHealth1)
      expect(enemyMob2.currentHealth).toBeLessThan(initialHealth2)
      expect(projectile.hitTargets.size).toBe(2)
    })

    test('should not damage owner', () => {
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, mob.id, 5, 'physical', 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)
      gameState.mobs.set(mob.id, mob)

      const initialHealth = mob.currentHealth
      projectileManager.handleEntityCollision(projectile, mob)

      // Owner should not take damage
      expect(mob.currentHealth).toBe(initialHealth)
      expect(projectile.hitTargets.size).toBe(0)
    })

    test('should not damage entity in the same team', () => {
      const alliedMob = new Mob({ id: 'mob-2', x: 105, y: 100 })
      alliedMob.teamId = 'team-a'
      mob.teamId = 'team-a'

      const projectile = new Projectile('proj-1', 100, 100, 10, 0, mob.id, 5, 'physical', 'spear', 10, SPEAR_THROWER_STATS.projectileRadius, SPEAR_THROWER_STATS.projectileLifetime, mob.teamId, 0)
      
      gameState.projectiles.set(projectile.id, projectile)
      gameState.mobs.set(mob.id, mob)
      gameState.mobs.set(alliedMob.id, alliedMob)

      const initialHealth = alliedMob.currentHealth
      projectileManager.handleEntityCollision(projectile, alliedMob)

      // Ally should not take damage
      expect(alliedMob.currentHealth).toBe(initialHealth)
      expect(projectile.hitTargets.size).toBe(0)
    })

    test('should damage entity in different team', () => {
      const enemyMob = new Mob({ id: 'mob-3', x: 105, y: 100 })
      enemyMob.teamId = 'team-b'
      mob.teamId = 'team-a'

      const projectile = new Projectile('proj-1', 100, 100, 10, 0, mob.id, 5, 'physical', 'spear', 10, SPEAR_THROWER_STATS.projectileRadius, SPEAR_THROWER_STATS.projectileLifetime, mob.teamId, 0)
      
      gameState.projectiles.set(projectile.id, projectile)
      gameState.mobs.set(mob.id, mob)
      gameState.mobs.set(enemyMob.id, enemyMob)

      const initialHealth = enemyMob.currentHealth
      projectileManager.handleEntityCollision(projectile, enemyMob)

      // Enemy should take damage
      expect(enemyMob.currentHealth).toBeLessThan(initialHealth)
      expect(projectile.hitTargets.size).toBeGreaterThan(0)
    })

    test('should stick projectile on boundary collision', () => {
      const projectile = new Projectile('proj-1', 100, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)

      expect(projectile.isStuck).toBe(false)
      projectileManager.handleBoundaryCollision(projectile)

      expect(projectile.isStuck).toBe(true)
      expect(projectile.vx).toBe(0)
      expect(projectile.vy).toBe(0)
      expect(projectile.stuckAt).toBeGreaterThan(0)
    })

    test('projectiles from same team should ignore each other', () => {
      const projA = new Projectile('proj-A', 100, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10, SPEAR_THROWER_STATS.projectileRadius, SPEAR_THROWER_STATS.projectileLifetime, 'team-alpha', 0)
      const projB = new Projectile('proj-B', 100, 100, -10, 0, 'mob-2', 5, 'physical', 'spear', 10, SPEAR_THROWER_STATS.projectileRadius, SPEAR_THROWER_STATS.projectileLifetime, 'team-alpha', 0)
      
      projectileManager.handleProjectileCollision(projA, projB)

      expect(projA.hitTargets.size).toBe(0)
      expect(projB.hitTargets.size).toBe(0)
      expect(projA.isStuck).toBe(false)
      expect(projB.isStuck).toBe(false)
    })

    test('projectiles from different teams should clash and stick', () => {
      const projA = new Projectile('proj-A', 100, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10, SPEAR_THROWER_STATS.projectileRadius, SPEAR_THROWER_STATS.projectileLifetime, 'team-alpha', 0)
      const projB = new Projectile('proj-B', 100, 100, -10, 0, 'player-1', 5, 'physical', 'spear', 10, SPEAR_THROWER_STATS.projectileRadius, SPEAR_THROWER_STATS.projectileLifetime, 'team-beta', 0)
      
      projectileManager.handleProjectileCollision(projA, projB)

      expect(projA.hitTargets.size).toBeGreaterThan(0)
      expect(projB.hitTargets.size).toBeGreaterThan(0)
      expect(projA.isStuck).toBe(true)
      expect(projB.isStuck).toBe(true)
      expect(projA.vx).toBe(0)
      expect(projB.vx).toBe(0)
    })
  })

  describe('Projectile Deflection', () => {
    test('should deflect projectile when player attacks', () => {
      // Place projectile close to player and in attack cone
      player.x = 100
      player.y = 100
      // Incoming projectile: velocity of -10 moving toward player
      const projectile = new Projectile('proj-1', 103, 100, -10, 0, 'mob-1', 5, 'physical', 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)

      player.isAttacking = true
      player.heading = 0 // Facing right (toward projectile)
      player.attackRange = 5
      player.radius = 1.3 // Player radius max is 1.3

      const initialVx = projectile.vx
      const deflected = projectileManager.checkDeflection(projectile, player)

      expect(deflected).toBe(true)
      expect(projectile.vx).toBeGreaterThan(0) // Reversed direction (was negative, now bounces away as positive)
      expect(projectile.ownerId).toBe(player.id)
      expect(projectile.hitTargets.size).toBe(0) // Can damage again
      expect(projectile.deflectedBy).toBe(player.id)
    })

    test('deflect scales damage by deflectedDamageMultiplier for physicSpear', () => {
      player.x = 100
      player.y = 100
      player.isAttacking = true
      player.heading = 0
      player.attackRange = 5
      player.radius = 1.3

      const meleeSwing = new Projectile('swing', 100, 100, 0, 0, player.id, 0, 'physical', WEAPON_TYPES.MELEE, 3)
      gameState.projectiles.set(meleeSwing.id, meleeSwing)

      const spear = new Projectile(
        'spear-in',
        103,
        100,
        -10,
        0,
        'mob-1',
        10,
        'physical',
        WEAPON_TYPES.PHYSIC_SPEAR,
        20
      )
      gameState.projectiles.set(spear.id, spear)

      expect(projectileManager.checkDeflection(spear, player)).toBe(true)
      // 10 * 0.80 physicSpear deflectedDamage * 1.2 MELEE deflectPower (damage only)
      expect(spear.damage).toBe(9)

      gameState.projectiles.delete(meleeSwing.id)
    })

    test('deflected projectile should keep traveling and not instantly despawn', () => {
      const physicsManager = new PlanckPhysicsManager()

      // Place player and projectile within deflection cone/range
      player.x = 100
      player.y = 100
      player.heading = 0
      player.attackRange = 5
      player.radius = 1.3
      player.isAttacking = true

      const projectile = new Projectile('proj-deflect', 103, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10)
      // Simulate projectile already having traveled close to its max range
      projectile.distanceTraveled = 9.5

      gameState.projectiles.set(projectile.id, projectile)

      // Create physics body so distanceTraveled updates during flight
      physicsManager.createProjectileBody(projectile)

      // First: deflect
      const deflected = projectileManager.checkDeflection(projectile, player)
      expect(deflected).toBe(true)

      // After deflect, projectile should be reset to continue flying
      expect(projectile.distanceTraveled).toBeLessThan(1)
      expect(projectile.isStuck).toBe(false)

      // Simulate a few ticks of projectile updates
      for (let i = 0; i < 3; i++) {
        projectileManager.updateProjectiles(gameState.projectiles, 100, physicsManager)
      }

      // Projectile should still be in the map (not despawned by range)
      expect(gameState.projectiles.has(projectile.id)).toBe(true)
      expect(projectile.shouldDespawn()).toBe(false)

      // And it should still be moving (non-zero velocity)
      expect(Math.abs(projectile.vx) + Math.abs(projectile.vy)).toBeGreaterThan(0)

      physicsManager.removeBody(projectile.id)
    })

    test('should not deflect if already deflected', () => {
      const projectile = new Projectile('proj-1', 110, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10)
      projectile.deflectedBy = 'player-2'
      gameState.projectiles.set(projectile.id, projectile)

      player.isAttacking = true
      player.heading = 0
      player.attackRange = 5

      const deflected = projectileManager.checkDeflection(projectile, player)
      expect(deflected).toBe(false)
    })

    test('should not deflect if player not attacking', () => {
      const projectile = new Projectile('proj-1', 110, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10)
      gameState.projectiles.set(projectile.id, projectile)

      player.isAttacking = false
      player.heading = 0
      player.attackRange = 5

      const deflected = projectileManager.checkDeflection(projectile, player)
      expect(deflected).toBe(false)
    })

    test('should not deflect if out of range', () => {
      const projectile = new Projectile('proj-1', 200, 100, 10, 0, 'mob-1', 5, 'physical', 'spear', 10)
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

      mob.updateAttack(gameState, 'test-room')

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

      mob.updateAttack(gameState, 'test-room')

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

      mob.updateAttack(gameState, 'test-room')

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

    test('deflected spear remains in game state and moves over multiple ticks', () => {
      const physicsManager = new PlanckPhysicsManager()

      // Minimal setup: one mob (spear thrower) and one player
      mob.id = 'mob-thrower'
      mob.x = 100
      mob.y = 100
      mob.teamId = 'team-enemy'

      player.id = 'player-1'
      player.x = 110
      player.y = 100
      player.teamId = 'team-player'
      player.radius = 1.3
      player.attackRange = 5
      player.heading = Math.PI // Face left, toward incoming spear

      gameState.mobs.set(mob.id, mob)
      gameState.players.set(player.id, player)

      // Create an incoming spear from the mob towards the player
      const incoming = projectileManager.createSpear(mob, player.x, player.y, 5, 'physical', 10)
      gameState.projectiles.set(incoming.id, incoming)
      physicsManager.createProjectileBody(incoming)

      // Simulate a bit of flight so it's mid-air
      for (let i = 0; i < 3; i++) {
        projectileManager.updateProjectiles(gameState.projectiles, 50, physicsManager)
      }

      // Player performs an attack and deflects the spear
      player.isAttacking = true
      const deflected = projectileManager.checkDeflection(incoming, player)
      expect(deflected).toBe(true)

      // Sync physics body to new direction (server does this in GameSimulationSystem)
      physicsManager.syncEntityToBody(incoming, incoming.id)

      // Now run several full projectile update ticks
      for (let i = 0; i < 5; i++) {
        projectileManager.updateProjectiles(gameState.projectiles, 100, physicsManager)
      }

      // Projectile should still exist and be moving in the reversed direction
      expect(gameState.projectiles.has(incoming.id)).toBe(true)
      const proj = gameState.projectiles.get(incoming.id)!
      expect(Math.abs(proj.vx) + Math.abs(proj.vy)).toBeGreaterThan(0)

      physicsManager.removeBody(incoming.id)
    })
  })
})

