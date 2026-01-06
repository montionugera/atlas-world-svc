
import { SPEAR_THROWER_STATS, calculateSpearMaxRange, MOB_STATS } from '../combatConfig'
import { PROJECTILE_GRAVITY } from '../physicsConfig'
import { AttackCharacteristicType, AttackDefinition, MobTypeConfig } from './types'

/**
 * Calculate radius for a mob type
 */
export function calculateMobRadius(mobType: MobTypeConfig): number {
  if (mobType.radius === undefined) {
    // Default: random radius between 1-4
    return 1 + 3 * Math.random()
  }

  if (typeof mobType.radius === 'number') {
    return mobType.radius
  }

  // Array [min, max]
  const [min, max] = mobType.radius
  return min + Math.random() * (max - min)
}

/**
 * Calculate spear max range for a mob based on its radius
 */
export function calculateSpearRangeForMob(radius: number, speedUnitsPerSec: number = SPEAR_THROWER_STATS.spearSpeed): number {
  const visualHeight = radius * 2
  return calculateSpearMaxRange(visualHeight, PROJECTILE_GRAVITY, speedUnitsPerSec)
}

/**
 * Calculate effective attack range for an attack definition
 * For projectile attacks with atkRange=0, calculates based on physics
 */
export function calculateEffectiveAttackRange(
  attack: AttackDefinition,
  mobRadius: number
): number {
  // Calculate range for projectile attacks
  if (attack.atkCharacteristic.type === AttackCharacteristicType.PROJECTILE) {
    const projectile = attack.atkCharacteristic.projectile
    // If atkRange is 0, calculate from physics
    if (projectile.atkRange > 0) {
      return projectile.atkRange
    }
    return calculateSpearRangeForMob(mobRadius, projectile.speedUnitsPerSec)
  }

  // For area attacks, use the atkRange (which should equal areaRadius)
  if (attack.atkCharacteristic.type === AttackCharacteristicType.AREA) {
    return attack.atkCharacteristic.area.atkRange
  }

  // Fallback
  return MOB_STATS.attackRange
}
