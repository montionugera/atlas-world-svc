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

  private castTime: number = 0
  
  constructor(
    projectileManager?: ProjectileManager,
    gameState?: GameState,
    options?: { castTime?: number }
  ) {
    this.projectileManager = projectileManager || null
    this.gameState = gameState || null
    if (options?.castTime) {
      this.castTime = options.castTime
    }
  }

  getCastTime(): number {
    return this.castTime
  }

  canExecute(mob: Mob, target: Player): boolean {
    if (!target.isAlive) return false
    if (!mob.canAttack()) return false

    const distance = mob.getDistanceTo(target)
    const effectiveRange = mob.attackRange + mob.radius + target.radius
    return distance <= effectiveRange
  }

  execute(mob: Mob, target: Player, roomId: string): boolean {
    // Basic validation first
    if (!target.isAlive || !mob.canAttack()) {
       return false
    }

    // RANGE CHECK LOGIC:
    // 1. If instant attack (castTime === 0): Strict range check required.
    // 2. If committed attack (castTime > 0): Relaxed check. We allow it to fire even if out of range,
    //    as long as it was valid when we started casting (checked in attemptExecute).
    const isCommitted = this.castTime > 0
    
    if (!isCommitted) {
        // Strict check for instant attacks
        if (!this.canExecute(mob, target)) {
            console.log(`⚠️ MELEE: ${mob.id} can't execute instant melee attack on ${target.id} (out of range/condition)`)
            return false
        }
    } else {
        // Warning if out of range but allowing it
        const distance = mob.getDistanceTo(target)
        const effectiveRange = mob.attackRange + mob.radius + target.radius
        if (distance > effectiveRange) {
             console.log(`⚠️ MELEE: ${mob.id} target out of range (${distance.toFixed(1)} > ${effectiveRange.toFixed(1)}) but committed (cast=${this.castTime}ms). Executing anyway.`)
        }
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

    // Check if casting is needed
    if (this.castTime > 0) {
      return {
        canExecute: true,
        needsCasting: true,
        executed: false,
      }
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

