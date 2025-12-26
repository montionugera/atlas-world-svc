/**
 * Attack Strategy Factory
 * Converts AttackStrategyConfig to AttackStrategy instances
 */

import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { MeleeAttackStrategy } from '../ai/strategies/MeleeAttackStrategy'
import { SpearThrowAttackStrategy } from '../ai/strategies/SpearThrowAttackStrategy'
import { ProjectileManager } from '../modules/ProjectileManager'
import { GameState } from '../schemas/GameState'
import {
  AttackStrategyConfig,
  AttackDefinition,
  calculateEffectiveAttackRange,
  AttackCharacteristicType,
} from './mobTypesConfig'

/**
 * Create AttackStrategy instances from AttackStrategyConfig
 */
export function createAttackStrategies(
  strategyConfig: AttackStrategyConfig,
  mobRadius: number,
  projectileManager: ProjectileManager | null,
  gameState: GameState | null
): AttackStrategy[] {
  if (!projectileManager || !gameState) {
    return []
  }

  const strategies: AttackStrategy[] = []

  // Handle different strategy types
  switch (strategyConfig.id) {
    case 'melee': {
      // Use first attack definition for melee
      const attack = strategyConfig.attacks[0]
      if (attack && attack.atkCharacteristic.type === AttackCharacteristicType.PROJECTILE) {
        strategies.push(
          new MeleeAttackStrategy(projectileManager, gameState)
        )
      }
      break
    }

    case 'spear': {
      // Use first attack definition for spear
      const attack = strategyConfig.attacks[0]
      if (attack && attack.atkCharacteristic.type === AttackCharacteristicType.PROJECTILE) {
        const effectiveRange = calculateEffectiveAttackRange(attack, mobRadius)
        strategies.push(
          new SpearThrowAttackStrategy(projectileManager, gameState, {
            damage: attack.atkBaseDmg,
            maxRange: effectiveRange,
            castTime: attack.castingTimeInMs,
          })
        )
      }
      break
    }

    case 'doubleAttack': {
      // Create multiple strategies for double attack
      // First attack (instant)
      const firstAttack = strategyConfig.attacks[0]
      if (firstAttack && firstAttack.atkCharacteristic.type === AttackCharacteristicType.PROJECTILE) {
        strategies.push(
          new MeleeAttackStrategy(projectileManager, gameState)
        )
      }

      // Second attack (delayed) - reuse melee strategy but with different timing
      // Note: The actual double-attack logic would need to be handled in the strategy itself
      // For now, we create a second melee strategy
      const secondAttack = strategyConfig.attacks[1]
      if (secondAttack && secondAttack.atkCharacteristic.type === AttackCharacteristicType.PROJECTILE) {
        // TODO: Create a DoubleAttackStrategy that handles multiple attacks
        // For now, just add another melee strategy
        strategies.push(
          new MeleeAttackStrategy(projectileManager, gameState)
        )
      }
      break
    }

    default: {
      // Generic handler: try to create strategy based on attack characteristics
      for (const attack of strategyConfig.attacks) {
        if (attack.atkCharacteristic.type === AttackCharacteristicType.PROJECTILE) {
          const effectiveRange = calculateEffectiveAttackRange(attack, mobRadius)
          
          if (attack.castingTimeInMs === 0) {
            // Instant attack = melee
            strategies.push(
              new MeleeAttackStrategy(projectileManager, gameState)
            )
          } else {
            // Ranged attack = spear-like
            strategies.push(
              new SpearThrowAttackStrategy(projectileManager, gameState, {
                damage: attack.atkBaseDmg,
                maxRange: effectiveRange,
                castTime: attack.castingTimeInMs,
              })
            )
          }
        } else if (attack.atkCharacteristic.type === AttackCharacteristicType.AREA) {
          // TODO: Create AreaAttackStrategy
          console.warn(`⚠️ Area attacks not yet implemented for strategy ${strategyConfig.id}`)
        }
      }
      break
    }
  }

  return strategies
}

