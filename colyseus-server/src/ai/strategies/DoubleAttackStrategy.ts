import { AttackStrategy, AttackExecutionResult } from './AttackStrategy'
import { WorldLife } from '../../schemas/WorldLife'
import { ProjectileManager } from '../../modules/ProjectileManager'
import { GameState } from '../../schemas/GameState'
import { AttackDefinition, AttackCharacteristicType } from '../../config/mobTypesConfig'
import { calculateEffectiveAttackRange } from '../../config/mobTypesConfig'
import { ProjectileType } from '../../config/combatConfig'

export class DoubleAttackStrategy implements AttackStrategy {
  name = 'doubleAttack'
  public maxRange: number
  private projectileManager: ProjectileManager
  private gameState: GameState
  private attacks: AttackDefinition[]

  // Must be roughly facing the target to start this committed combo.
  // Matches the melee cone check threshold (~0.5 rad).
  private static readonly HEADING_DIFF_THRESHOLD_RAD = Math.PI/180*10

  constructor(
    projectileManager: ProjectileManager,
    gameState: GameState,
    attacks: AttackDefinition[]
  ) {
    this.projectileManager = projectileManager
    this.gameState = gameState
    this.attacks = attacks
    // Set maxRange based on the first attack
    if (this.attacks.length > 0) {
      // Default fallback size 4 for radius calculation if radius isn't strictly known here
      this.maxRange = calculateEffectiveAttackRange(this.attacks[0], 4)
    } else {
      this.maxRange = 10
    }
  }
  canExecute(attacker: any, target: any): boolean {
    if (!target.isAlive) return false
    if (!attacker.canAttack || !attacker.canAttack()) return false

    // Check range for the first attack
    const firstAttack = this.attacks[0]
    if (!firstAttack) return false

    const distance = attacker.getDistanceTo(target)
    
    // Calculate edge-to-edge distance to be physically accurate even when clustered
    const edgeToEdgeDistance = Math.max(0, distance - attacker.radius - (target.radius || 4))
    
    // Compare against the strictly configured range of the attack itself
    const effectiveRange = calculateEffectiveAttackRange(firstAttack, 0)
    
    if (edgeToEdgeDistance > effectiveRange) return false

    // Require heading alignment before starting a cast/queue.
    const targetHeading = Math.atan2(target.y - attacker.y, target.x - attacker.x)
    let diff = targetHeading - attacker.heading
    while (diff < -Math.PI) diff += Math.PI * 2
    while (diff > Math.PI) diff -= Math.PI * 2

    return Math.abs(diff) <= DoubleAttackStrategy.HEADING_DIFF_THRESHOLD_RAD
  }
  getCastTime(): number {
    // Return cast time for the current step in the combo
    // For Queue System: Return 0 because the "setup" is instant.
    // The actual delays are handled by the queue.
    return 0
  }
  execute(attacker: any, target: any, roomId: string): boolean {
    // Safety check
    if (!target || !target.isAlive) return false
    if (this.attacks.length === 0) return false

    
    // Pass strictly the current time as start time
    if (!attacker.combatSystem || typeof attacker.combatSystem.enqueueAttacks !== 'function') {
        attacker.enqueueAttacks(this, target.id, this.attacks, Date.now())
    } else {
        attacker.combatSystem.enqueueAttacks(this, target.id, this.attacks, Date.now())
    }
    
    return true
  }

  public performAttack(attacker: any, target: any, attack: AttackDefinition): void {
      if (attack.atkCharacteristic.type === AttackCharacteristicType.PROJECTILE) {
          const char = attack.atkCharacteristic.projectile
          
          // Calculate target position based on heading
          // This ensures the projectile flies in the direction the attacker is facing (supports dodgeable attacks)
          const heading = attacker.heading
          const range = char.atkRange || 10
          const targetX = attacker.x + Math.cos(heading) * range
          const targetY = attacker.y + Math.sin(heading) * range
          
          const projectileType = char.projectileType || 'spear'

          if (projectileType === 'melee') {
              const projectile = this.projectileManager.createMelee(
                  attacker,
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
                  attacker,
                  targetX,
                  targetY,
                  attack.atkBaseDmg,
                  char.atkRange || 10,
                  char.projectileRadius,
                  char.speedUnitsPerSec,
                  projectileType as ProjectileType
              )
              this.gameState.projectiles.set(projectile.id, projectile)
          }
      }
  }

  attemptExecute(attacker: any, target: any, roomId: string): AttackExecutionResult {
    if (!this.canExecute(attacker, target)) {
      return { canExecute: false, needsCasting: false, executed: false }
    }

    // For Queue System: We always "execute" immediately to populate the queue.
    // The queue then manages the "casting" state internally in Mob.ts.
    // So we tell the actor "we executed" and "no casting needed from you".
    const executed = this.execute(attacker, target, roomId)
    
    return {
      canExecute: true,
      needsCasting: false, 
      executed,
      targetId: executed ? target.id : undefined,
    }
  }
}
