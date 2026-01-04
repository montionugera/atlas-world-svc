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

  getCastTime(): number {
    // Use the cast time of the first attack to start the combo
    return this.attacks[0]?.castingTimeInMs || 0
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

  execute(mob: Mob, target: Player, roomId: string): boolean {
    if (!this.canExecute(mob, target)) return false
    if (this.attacks.length === 0) return false

    // Execute first attack immediately (as cast time is already handled by Mob)
    this.performAttack(mob, target, this.attacks[0])

    // Schedule subsequent attacks
    // We start from index 1
    let accumulatedDelay = 0
    for (let i = 1; i < this.attacks.length; i++) {
        const attack = this.attacks[i]
        // Use the attack's castingTimeInMs as the delay between hits
        accumulatedDelay += attack.castingTimeInMs
        
        setTimeout(() => {
            if (mob.isAlive && target.isAlive) {
                 this.performAttack(mob, target, attack)
            }
        }, accumulatedDelay)
    }

    return true
  }

  private performAttack(mob: Mob, target: Player, attack: AttackDefinition): void {
      if (attack.atkCharacteristic.type === AttackCharacteristicType.PROJECTILE) {
          const char = attack.atkCharacteristic.projectile
          
          if (char.speedUnitsPerSec >= 80) {
              const projectile = this.projectileManager.createMelee(
                  mob,
                  target.x,
                  target.y,
                  attack.atkBaseDmg,
                  char.atkRange || 10,
                  char.projectileRadius
              )
              this.gameState.projectiles.set(projectile.id, projectile)
          } else {
              const projectile = this.projectileManager.createSpear(
                  mob,
                  target.x,
                  target.y,
                  attack.atkBaseDmg,
                  char.atkRange || 10,
                  char.projectileRadius
              )
              this.gameState.projectiles.set(projectile.id, projectile)
          }
      }
  }

  attemptExecute(mob: Mob, target: Player, roomId: string): AttackExecutionResult {
    if (!this.canExecute(mob, target)) {
      return { canExecute: false, needsCasting: false, executed: false }
    }

    const castTime = this.getCastTime()
    if (castTime > 0) {
      return {
        canExecute: true,
        needsCasting: true,
        executed: false,
      }
    }

    const executed = this.execute(mob, target, roomId)
    return {
      canExecute: true,
      needsCasting: false,
      executed,
      targetId: executed ? target.id : undefined,
    }
  }
}
