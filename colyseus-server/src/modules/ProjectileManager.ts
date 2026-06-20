import { Projectile } from '../schemas/Projectile'
import { WorldLife } from '../schemas/WorldLife'
import { BattleModule } from './BattleModule'
import { BattleManager } from './BattleManager'
import { GameState } from '../schemas/GameState'
import {
  SPEAR_THROWER_STATS,
  MELEE_PROJECTILE_STATS,
  ProjectileType,
  WEAPON_TYPES,
} from '../config/combatConfig'
import { PROJECTILE_GRAVITY } from '../config/physicsConfig'
import { ProjectileFactory } from './projectile/ProjectileFactory'
import { DeflectionResolver } from './projectile/DeflectionResolver'
import { ProjectileCollisionResolver } from './projectile/ProjectileCollisionResolver'

export class ProjectileManager {
  private gameState: GameState
  private battleModule: BattleModule
  private gravity: number = PROJECTILE_GRAVITY
  private maxSpeed: number = 2000 // Raised from 36 to support fast projectiles

  private battleManager?: BattleManager

  private factory: ProjectileFactory
  private deflectionResolver: DeflectionResolver
  private collisionResolver: ProjectileCollisionResolver

  constructor(gameState: GameState, battleModule: BattleModule, battleManager?: BattleManager) {
    this.gameState = gameState
    this.battleModule = battleModule
    this.battleManager = battleManager
    this.factory = new ProjectileFactory(gameState)
    this.deflectionResolver = new DeflectionResolver(gameState)
    this.collisionResolver = new ProjectileCollisionResolver(
      gameState,
      battleModule,
      battleManager,
      this.deflectionResolver
    )
  }

  /**
   * Create a melee projectile from actor to target
   * Short range, fast speed for near-instant hits
   */
  createMelee(
    actor: WorldLife,
    targetX: number,
    targetY: number,
    damage: number,
    damageType: 'physical' | 'magical' = 'physical',
    radius: number = MELEE_PROJECTILE_STATS.projectileRadius,
    speed: number = MELEE_PROJECTILE_STATS.meleeSpeed,
    meleeProjectileType: ProjectileType = WEAPON_TYPES.MELEE,
    lifetimeMs: number = MELEE_PROJECTILE_STATS.projectileLifetime
  ): Projectile {
    return this.factory.createMelee(
      actor,
      targetX,
      targetY,
      damage,
      damageType,
      radius,
      speed,
      meleeProjectileType,
      lifetimeMs
    )
  }

  /**
   * Create a spear projectile from attacker to target
   * Calculates trajectory based on configurable physics
   */
  createSpear(
    mob: WorldLife,
    targetX: number,
    targetY: number,
    damage: number,
    damageType: 'physical' | 'magical' = 'physical',
    maxRange: number = SPEAR_THROWER_STATS.spearMaxRange,
    radius: number = SPEAR_THROWER_STATS.projectileRadius,
    speed: number = this.maxSpeed,
    type: ProjectileType = WEAPON_TYPES.SPEAR
  ): Projectile {
    return this.factory.createSpear(
      mob,
      targetX,
      targetY,
      damage,
      damageType,
      maxRange,
      radius,
      speed,
      type
    )
  }

  /**
   * Update all projectiles: apply gravity, cap speed, track distance
   */
  updateProjectiles(
    projectiles: Map<string, Projectile>,
    deltaTime: number,
    physicsManager: any
  ): void {
    for (const projectile of projectiles.values()) {
      if (projectile.isStuck) continue

      // Update physics (gravity, speed cap, distance tracking) - uses configurable values
      physicsManager.updateProjectile(projectile, deltaTime, this.gravity, this.maxSpeed)

      // Sync position from physics body
      const body = physicsManager.getBody(projectile.id)
      if (body) {
        const position = body.getPosition()
        projectile.x = position.x
        projectile.y = position.y
      }
    }
  }

  /**
   * Handle projectile collision with living entities (Players or Mobs)
   * Piercing: keeps flying; can damage multiple targets (melee cleave).
   * Non-piercing: damages once per target cap, then `stick()` — stops at hit, despawn after `lifetime`.
   */
  handleEntityCollision(projectile: Projectile, target: WorldLife): void {
    return this.collisionResolver.handleEntityCollision(projectile, target)
  }

  /**
   * Handle projectile collision with another projectile
   * Projectiles from different teams cancel each other out
   */
  handleProjectileCollision(projectileA: Projectile, projectileB: Projectile): void {
    return this.collisionResolver.handleProjectileCollision(projectileA, projectileB)
  }

  /**
   * Handle projectile collision with boundary
   * Projectile sticks and despawns after lifetime
   */
  handleBoundaryCollision(projectile: Projectile): void {
    return this.collisionResolver.handleBoundaryCollision(projectile)
  }

  /**
   * Check if projectile can be deflected by attacker and reflects it using configuration rules
   * Returns true if deflected, false otherwise
   */
  checkDeflection(projectile: Projectile, attacker: WorldLife): boolean {
    return this.deflectionResolver.checkDeflection(projectile, attacker)
  }
}
