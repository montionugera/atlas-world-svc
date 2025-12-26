import { AttackStrategy, AttackExecutionResult } from './AttackStrategy'
import { Mob } from '../../schemas/Mob'
import { Player } from '../../schemas/Player'
import { ProjectileManager } from '../../modules/ProjectileManager'
import { GameState } from '../../schemas/GameState'

/**
 * Melee Attack Strategy
 * Close-range attack using projectile system (unified flow)
 * Creates short-range, fast projectiles for near-instant hits
 */
export class MeleeAttackStrategy implements AttackStrategy {
  name = 'melee'
  private projectileManager: ProjectileManager | null
  private gameState: GameState | null

  constructor(
    projectileManager?: ProjectileManager,
    gameState?: GameState
  ) {
    this.projectileManager = projectileManager || null
    this.gameState = gameState || null
  }

  getCastTime(): number {
    return 0 // Instant attack
  }

  canExecute(mob: Mob, target: Player): boolean {
    if (!target.isAlive) return false
    if (!mob.canAttack()) return false

    const distance = mob.getDistanceTo(target)
    const effectiveRange = mob.attackRange + mob.radius + target.radius
    return distance <= effectiveRange
  }

  execute(mob: Mob, target: Player, roomId: string): boolean {
    if (!this.canExecute(mob, target)) {
      console.log(`⚠️ MELEE: ${mob.id} can't execute melee attack on ${target.id}`)
      return false
    }

    // Require projectileManager and gameState for unified projectile flow
    if (!this.projectileManager || !this.gameState) {
      console.error(`❌ MELEE: ${mob.id} cannot execute - projectileManager or gameState not provided`)
      return false
    }

    // Calculate target position (lead target if moving)
    const targetX = target.x + target.vx * 0.05 // Small lead for melee
    const targetY = target.y + target.vy * 0.05

    // Create melee projectile (short range, fast speed)
    const projectile = this.projectileManager.createMelee(
      mob,
      targetX,
      targetY,
      mob.attackDamage
    )

    // Add to game state (synced to clients)
    this.gameState.projectiles.set(projectile.id, projectile)

    console.log(`🗡️ MELEE: ${mob.id} executing melee attack on ${target.id}, created projectile ${projectile.id}`)
    return true
  }

  attemptExecute(mob: Mob, target: Player, roomId: string): AttackExecutionResult {
    if (!this.canExecute(mob, target)) {
      return { canExecute: false, needsCasting: false, executed: false }
    }

    // Melee is instant (castTime = 0), so execute immediately
    const executed = this.execute(mob, target, roomId)
    return {
      canExecute: true,
      needsCasting: false,
      executed,
      targetId: executed ? target.id : undefined,
    }
  }
}

