import { AttackStrategy } from './AttackStrategy'
import { Mob } from '../../schemas/Mob'
import { Player } from '../../schemas/Player'
import { ProjectileManager } from '../../modules/ProjectileManager'
import { GameState } from '../../schemas/GameState'
import { SPEAR_THROWER_STATS } from '../../config/combatConfig'

/**
 * Spear Throw Attack Strategy
 * Ranged attack with configurable wind-up time
 */
export class SpearThrowAttackStrategy implements AttackStrategy {
  name = 'spearThrow'
  private projectileManager: ProjectileManager
  private gameState: GameState
  private damage: number = SPEAR_THROWER_STATS.spearDamage
  public maxRange: number = SPEAR_THROWER_STATS.spearMaxRange
  private windUpTime: number = SPEAR_THROWER_STATS.windUpTime

  constructor(
    projectileManager: ProjectileManager,
    gameState: GameState,
    options?: {
      damage?: number
      maxRange?: number
      windUpTime?: number
    }
  ) {
    this.projectileManager = projectileManager
    this.gameState = gameState
    if (options) {
      this.damage = options.damage ?? this.damage
      this.maxRange = options.maxRange ?? this.maxRange
      this.windUpTime = options.windUpTime ?? this.windUpTime
    }
  }

  getWindUpTime(): number {
    return this.windUpTime
  }

  canExecute(mob: Mob, target: Player): boolean {
    if (!target.isAlive) return false
    if (!mob.canAttack()) return false

    const distance = mob.getDistanceTo(target)
    return distance <= this.maxRange
  }

  execute(mob: Mob, target: Player, roomId: string): boolean {
    if (!this.canExecute(mob, target)) return false

    // Calculate target position (lead target if moving)
    const targetX = target.x + target.vx * 0.1 // Small lead
    const targetY = target.y + target.vy * 0.1

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
}

