import { AttackStrategy, AttackExecutionResult } from './AttackStrategy'
import { Mob } from '../../schemas/Mob'
import { Player } from '../../schemas/Player'
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

  constructor(
    projectileManager: ProjectileManager,
    gameState: GameState,
    options?: {
      damage?: number
      maxRange?: number
      castTime?: number
    }
  ) {
    this.projectileManager = projectileManager
    this.gameState = gameState
    if (options) {
      this.damage = options.damage ?? this.damage
      this.maxRange = options.maxRange ?? this.maxRange
      this.castTime = options.castTime ?? this.castTime
    }
  }

  getCastTime(): number {
    return this.castTime
  }

  canExecute(mob: Mob, target: Player): boolean {
    if (!target.isAlive) return false
    if (!mob.canAttack()) return false

    const distance = mob.getDistanceTo(target)
    return distance <= this.maxRange
  }

  execute(mob: Mob, target: Player, roomId: string): boolean {
    if (!this.canExecute(mob, target)) return false

    // Calculate target position based on heading
    // Currently aiming relies on heading which is locked during casting
    const heading = mob.heading
    const targetX = mob.x + Math.cos(heading) * this.maxRange
    const targetY = mob.y + Math.sin(heading) * this.maxRange

    // Create projectile
    const projectile = this.projectileManager.createSpear(
      mob,
      targetX,
      targetY,
      this.damage,
      this.maxRange
    )

    // Add to game state
    this.gameState.projectiles.set(projectile.id, projectile)

    // Create physics body (will be handled by GameRoom)
    return true
  }

  attemptExecute(mob: Mob, target: Player, roomId: string): AttackExecutionResult {
    if (!this.canExecute(mob, target)) {
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
    const executed = this.execute(mob, target, roomId)
    return {
      canExecute: true,
      needsCasting: false,
      executed,
      targetId: executed ? target.id : undefined,
    }
  }
}

