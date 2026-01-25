/**
 * Attack Strategy Factory
 * Converts AttackStrategyConfig to AttackStrategy instances
 */

import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { MeleeAttackStrategy } from '../ai/strategies/MeleeAttackStrategy'
import { SpearThrowAttackStrategy } from '../ai/strategies/SpearThrowAttackStrategy'
import { DoubleAttackStrategy } from '../ai/strategies/DoubleAttackStrategy'
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
          new MeleeAttackStrategy(projectileManager, gameState, {
            castTime: attack.atkWindUpTime
          })
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
            castTime: attack.atkWindUpTime,
            speed: attack.atkCharacteristic.projectile?.speedUnitsPerSec
          })
        )
      }
      break
    }

    case 'doubleAttack': {
      // Create DoubleAttackStrategy with all configured attacks
      strategies.push(
        new DoubleAttackStrategy(
            projectileManager, 
            gameState,
            strategyConfig.attacks
        )
      )
      break
    }

    default: {
      // Generic handler: try to create strategy based on attack characteristics
      for (const attack of strategyConfig.attacks) {
        if (attack.atkCharacteristic.type === AttackCharacteristicType.PROJECTILE) {
          const effectiveRange = calculateEffectiveAttackRange(attack, mobRadius)
          
          if (attack.atkWindUpTime === 0) {
            // Instant attack = melee
            strategies.push(
              new MeleeAttackStrategy(projectileManager, gameState, {
                castTime: attack.atkWindUpTime
              })
            )
          } else {
            // Ranged attack = spear-like
            strategies.push(
              new SpearThrowAttackStrategy(projectileManager, gameState, {
                damage: attack.atkBaseDmg,
                maxRange: effectiveRange,
                castTime: attack.atkWindUpTime,
                speed: attack.atkCharacteristic.projectile?.speedUnitsPerSec
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

