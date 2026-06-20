import { Projectile } from '../../schemas/Projectile'
import { WorldLife } from '../../schemas/WorldLife'
import { GameState } from '../../schemas/GameState'
import {
  SPEAR_THROWER_STATS,
  MELEE_PROJECTILE_STATS,
  PROJECTILE_MIN_MAX_RANGE,
  ProjectileType,
  WEAPON_TYPES,
} from '../../config/combatConfig'

export class ProjectileFactory {
  private gameState: GameState
  private maxSpeed: number = 2000 // Raised from 36 to support fast projectiles

  constructor(gameState: GameState) {
    this.gameState = gameState
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
    const dx = targetX - actor.x
    const dy = targetY - actor.y

    // Calculate angle to target
    const angle = Math.atan2(dy, dx)

    // Calculate initial velocity components
    const vx = speed * Math.cos(angle)
    const vy = speed * Math.sin(angle)

    // Spawn at edge of actor + small offset
    const spawnOffset = (actor.radius || 1) + 0.5
    const spawnX = actor.x + Math.cos(angle) * spawnOffset
    const spawnY = actor.y + Math.sin(angle) * spawnOffset

    // Travel budget must be spawn→target, not center→target, or the hitbox flies past the intended reach.
    const travelMaxRange = Math.max(
      PROJECTILE_MIN_MAX_RANGE,
      Math.hypot(targetX - spawnX, targetY - spawnY)
    )

    // Create projectile with melee stats
    const projectileId = `projectile-melee-${this.gameState.tick}-${Math.random().toString(36).slice(2, 4)}`
    const projectile = new Projectile(
      projectileId,
      spawnX,
      spawnY,
      vx,
      vy,
      actor.id,
      damage,
      damageType,
      meleeProjectileType,
      travelMaxRange,
      radius,
      lifetimeMs,
      actor.teamId,
      lifetimeMs
    )

    projectile.piercing = true; // Melee attacks cleave through multiple enemies!

    return projectile
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
    const dx = targetX - mob.x
    const dy = targetY - mob.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    // Calculate angle to target
    const angle = Math.atan2(dy, dx)

    // Use provided speed
    const maxSpeed = speed

    // Calculate initial velocity components
    const vx = maxSpeed * Math.cos(angle)
    const vy = maxSpeed * Math.sin(angle)

    // Spawn at edge of mob
    const spawnOffset = (mob.radius || 1) + 0.5
    const spawnX = mob.x + Math.cos(angle) * spawnOffset
    const spawnY = mob.y + Math.sin(angle) * spawnOffset

    // Create projectile with configurable radius
    const projectileId = `projectile-${this.gameState.tick}-${Math.random().toString(36).slice(2, 4)}`
    const projectile = new Projectile(
      projectileId,
      spawnX,
      spawnY,
      vx,
      vy,
      mob.id,
      damage,
      damageType,
      type,
      maxRange,
      radius,
      SPEAR_THROWER_STATS.projectileLifetime,
      mob.teamId,
      0
    )

    return projectile
  }
}
