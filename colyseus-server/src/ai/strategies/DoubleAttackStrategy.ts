import { AttackStrategy, AttackExecutionResult } from './AttackStrategy'
import { Mob } from '../../schemas/Mob'
import { Player } from '../../schemas/Player'
import { ProjectileManager } from '../../modules/ProjectileManager'
import { GameState } from '../../schemas/GameState'
import { AttackDefinition, AttackCharacteristicType } from '../../config/mobTypesConfig'
import { calculateEffectiveAttackRange } from '../../config/mobTypesConfig'

export class DoubleAttackStrategy implements AttackStrategy {
  name = 'doubleAttack'
  private projectileManager: ProjectileManager
  private gameState: GameState
  private attacks: AttackDefinition[]

  constructor(
    projectileManager: ProjectileManager,
    gameState: GameState,
    attacks: AttackDefinition[]
  ) {
    this.projectileManager = projectileManager
    this.gameState = gameState
    this.attacks = attacks
  }
  canExecute(mob: Mob, target: Player): boolean {
    if (!target.isAlive) return false
    if (!mob.canAttack()) return false

    // Check range for the first attack
    const firstAttack = this.attacks[0]
    if (!firstAttack) return false

    const distance = mob.getDistanceTo(target)
    const effectiveRange = calculateEffectiveAttackRange(firstAttack, mob.radius) + mob.radius + target.radius
    
    return distance <= effectiveRange
  }
  getCastTime(): number {
    // Return cast time for the current step in the combo
    // For Queue System: Return 0 because the "setup" is instant.
    // The actual delays are handled by the queue.
    return 0
  }
  execute(mob: Mob, target: Player, roomId: string): boolean {
    // Safety check
    if (!target || !target.isAlive) return false
    if (this.attacks.length === 0) return false

    
    // Pass strictly the current time as start time
    mob.enqueueAttacks(this, target.id, this.attacks, Date.now())
    
    return true
  }

  public performAttack(mob: Mob, target: Player, attack: AttackDefinition): void {
      if (attack.atkCharacteristic.type === AttackCharacteristicType.PROJECTILE) {
          const char = attack.atkCharacteristic.projectile
          
          // Calculate target position based on heading
          // This ensures the projectile flies in the direction the mob is facing (supports dodgeable attacks)
          const heading = mob.heading
          const range = char.atkRange || 10
          const targetX = mob.x + Math.cos(heading) * range
          const targetY = mob.y + Math.sin(heading) * range
          
          const projectileType = char.projectileType || 'spear'

          if (projectileType === 'melee') {
              const projectile = this.projectileManager.createMelee(
                  mob,
                  targetX,
                  targetY,
                  attack.atkBaseDmg,
                  char.atkRange || 10,
                  char.projectileRadius,
                  char.speedUnitsPerSec
              )
              this.gameState.projectiles.set(projectile.id, projectile)
          } else {
              // Default to 'spear' (projectile)
              const projectile = this.projectileManager.createSpear(
                  mob,
                  targetX,
                  targetY,
                  attack.atkBaseDmg,
                  char.atkRange || 10,
                  char.projectileRadius,
                  char.speedUnitsPerSec,
                  projectileType
              )
              this.gameState.projectiles.set(projectile.id, projectile)
          }
      }
  }

  attemptExecute(mob: Mob, target: Player, roomId: string): AttackExecutionResult {
    if (!this.canExecute(mob, target)) {
      return { canExecute: false, needsCasting: false, executed: false }
    }

    // For Queue System: We always "execute" immediately to populate the queue.
    // The queue then manages the "casting" state internally in Mob.ts.
    // So we tell Mob.ts "we executed" and "no casting needed from you".
    const executed = this.execute(mob, target, roomId)
    
    return {
      canExecute: true,
      needsCasting: false, 
      executed,
      targetId: executed ? target.id : undefined,
    }
  }
}
