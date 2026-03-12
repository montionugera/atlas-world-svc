import { AttackStrategy, AttackExecutionResult } from './AttackStrategy'
import { WorldLife } from '../../schemas/WorldLife'
import { ProjectileManager } from '../../modules/ProjectileManager'
import { GameState } from '../../schemas/GameState'
import { SPEAR_THROWER_STATS } from '../../config/combatConfig'

/**
 * Spear Throw Attack Strategy
 * Ranged attack with configurable cast time
 */
export class SpearThrowAttackStrategy implements AttackStrategy {
  name = 'spearThrow'
  private projectileManager: ProjectileManager
  private gameState: GameState
  private damage: number = SPEAR_THROWER_STATS.spearDamage
  public maxRange: number = SPEAR_THROWER_STATS.spearMaxRange
  private castTime: number = SPEAR_THROWER_STATS.castTime
  private speed: number = SPEAR_THROWER_STATS.spearSpeed

  constructor(
    projectileManager: ProjectileManager,
    gameState: GameState,
    options?: {
      damage?: number
      maxRange?: number
      castTime?: number
      speed?: number
    }
  ) {
    this.projectileManager = projectileManager
    this.gameState = gameState
    if (options) {
      this.damage = options.damage ?? this.damage
      this.maxRange = options.maxRange ?? this.maxRange
      this.castTime = options.castTime ?? this.castTime
      this.speed = options.speed ?? this.speed
    }
  }

  getCastTime(): number {
    return this.castTime
  }

  canExecute(attacker: any, target: any): boolean {
    if (!target.isAlive) return false
    if (!attacker.canAttack || !attacker.canAttack()) return false

    const distance = attacker.getDistanceTo(target)
    return distance <= this.maxRange
  }

  execute(attacker: any, target: any, roomId: string): boolean {
    // Only check if target exists/alive and attacker can attack
    // We do NOT check range here again, to allow "committed" attacks to finish
    if (!target || !target.isAlive) return false
    if (!attacker.canAttack || !attacker.canAttack()) return false

    // Calculate target position based on heading
    // Currently aiming relies on heading which is locked during casting
    const heading = attacker.heading
    const targetX = attacker.x + Math.cos(heading) * this.maxRange
    const targetY = attacker.y + Math.sin(heading) * this.maxRange

    // Create projectile
    const projectile = this.projectileManager.createSpear(
      attacker,
      targetX,
      targetY,
      this.damage,
      this.maxRange,
      undefined, // Default radius
      this.speed
    )

    // Add to game state
    this.gameState.projectiles.set(projectile.id, projectile)

    // Create physics body (will be handled by GameRoom)
    return true
  }

  attemptExecute(attacker: any, target: any, roomId: string): AttackExecutionResult {
    if (!this.canExecute(attacker, target)) {
      return { canExecute: false, needsCasting: false, executed: false }
    }

    // Spear throw needs casting (castTime > 0)
    if (this.castTime > 0) {
      return {
        canExecute: true,
        needsCasting: true,
        executed: false,
      }
    }

    // If somehow castTime is 0, execute immediately
    const executed = this.execute(attacker, target, roomId)
    return {
      canExecute: true,
      needsCasting: false,
      executed,
      targetId: executed ? target.id : undefined,
    }
  }
}

