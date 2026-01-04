/**
 * Mob Types Configuration
 * Defines mob archetypes with their attributes and spawn weights
 * New flexible attack system with detailed attack definitions
 */

import { MobCombatStats, MOB_STATS, MOB_TYPE_STATS, SPEAR_THROWER_STATS } from './combatConfig'
import { PROJECTILE_GRAVITY } from './physicsConfig'
import { calculateSpearMaxRange } from './combatConfig'

/**
 * Attack Characteristic Type Enum
 */
export enum AttackCharacteristicType {
  PROJECTILE = 'projectile',
  AREA = 'area',
}

/**
 * Attack Characteristic Types
 */
export interface AttackProjectile {
  /** Projectile speed in units per second */
  speedUnitsPerSec: number
  projectileRadius: number
  /** Maximum range (0 = calculate from physics based on speedUnitsPerSec and gravity) */
  atkRange: number
}

export interface AttackArea {
  areaRadius: number
  /** Range is the same as areaRadius for area attacks */
  atkRange: number
}

export type AttackCharacteristic = 
  | { type: AttackCharacteristicType.PROJECTILE; projectile: AttackProjectile }
  | { type: AttackCharacteristicType.AREA; area: AttackArea }

/**
 * Attack Definition
 * Defines a single attack with all its properties
 */
export interface AttackDefinition {
  /** Base damage of this attack */
  atkBaseDmg: number
  /** Radius of the attack (projectile radius or area radius) */
  atkRadius: number
  /** Casting time in milliseconds before attack executes */
  castingTimeInMs: number
  /** Attack characteristic (projectile or area) - contains range information */
  atkCharacteristic: AttackCharacteristic
}

/**
 * Attack Strategy Configuration
 * A strategy can contain multiple attacks (e.g., double attack)
 */
export interface AttackStrategyConfig {
  /** Strategy identifier (e.g., 'melee', 'spear', 'doubleAttack') */
  id: string
  /** List of attacks this strategy can perform */
  attacks: AttackDefinition[]
}

/**
 * Mob Type Configuration
 * Complete definition of a mob type with all its attributes
 */
export interface MobTypeConfig {
  /** Unique identifier for this mob type */
  id: string
  /** Display name */
  name: string

  /** Mob Health Points (overrides stats.maxHealth) */
  hp?: number
  /** Body radius of the mob */
  radius?: number | [number, number] // Single value or [min, max] range
  /** Base combat stats (overrides MOB_STATS defaults) */
  stats: Partial<MobCombatStats>
  /** Attack strategies this mob can use */
  atkStrategies: AttackStrategyConfig[]
}

/**
 * Mob Type Definitions
 * Add new mob types here with their attributes
 */
export const MOB_TYPES: MobTypeConfig[] = [
  {
    id: 'spear_thrower',
    name: 'Spear Thrower',

    hp: 80,
    radius: 3,
    stats: {
      attackRange: MOB_STATS.attackRange,
      chaseRange: 20, // Longer chase range - prefers ranged combat
    },
    atkStrategies: [
      {
        id: 'melee',
        attacks: [
          {
            atkBaseDmg: MOB_STATS.attackDamage,
            atkRadius: 0.3,
            castingTimeInMs: 0, // Instant
            atkCharacteristic: {
              type: AttackCharacteristicType.PROJECTILE,
              projectile: {
                speedUnitsPerSec: 100,
                projectileRadius: 0.3,
                atkRange: MOB_STATS.attackRange,
              },
            },
          },
        ],
      },
      {
        id: 'spear',
        attacks: [
          {
            atkBaseDmg: SPEAR_THROWER_STATS.spearDamage + 1,
            atkRadius: SPEAR_THROWER_STATS.projectileRadius,
            castingTimeInMs: SPEAR_THROWER_STATS.castTime,
            atkCharacteristic: {
              type: AttackCharacteristicType.PROJECTILE,
              projectile: {
                speedUnitsPerSec: SPEAR_THROWER_STATS.spearSpeed,
                projectileRadius: SPEAR_THROWER_STATS.projectileRadius,
                atkRange: 0, // Will be calculated based on radius and physics
              },
            },
          },
        ],
      },
    ],
  },
  {
    id: 'hybrid',
    name: 'Hybrid Fighter',

    hp: 120,
    radius: 4,
    stats: {
      attackRange: MOB_STATS.attackRange,
      chaseRange: MOB_STATS.chaseRange,
    },
    atkStrategies: [
      {
        id: 'melee',
        attacks: [
          {
            atkBaseDmg: MOB_STATS.attackDamage,
            atkRadius: 0.3,
            castingTimeInMs: 0,
            atkCharacteristic: {
              type: AttackCharacteristicType.PROJECTILE,
              projectile: {
                speedUnitsPerSec: 100,
                projectileRadius: 0.3,
                atkRange: MOB_STATS.attackRange,
              },
            },
          },
        ],
      },
      {
        id: 'spear',
        attacks: [
          {
            atkBaseDmg: SPEAR_THROWER_STATS.spearDamage,
            atkRadius: SPEAR_THROWER_STATS.projectileRadius,
            castingTimeInMs: SPEAR_THROWER_STATS.castTime,
            atkCharacteristic: {
              type: AttackCharacteristicType.PROJECTILE,
              projectile: {
                speedUnitsPerSec: SPEAR_THROWER_STATS.spearSpeed,
                projectileRadius: SPEAR_THROWER_STATS.projectileRadius,
                atkRange: 0, // Will be calculated based on radius and physics
              },
            },
          },
        ],
      },
    ],
  },
  {
    id: 'aggressive',
    name: 'Aggressive Mob',

    hp: 90,
    radius: 3.5,
    stats: {
      attackRange: MOB_TYPE_STATS.aggressive.attackRange,
      chaseRange: MOB_TYPE_STATS.aggressive.chaseRange,
    },
    atkStrategies: [
      {
        id: 'melee',
        attacks: [
          {
            atkBaseDmg: MOB_STATS.attackDamage,
            atkRadius: 0.3,
            castingTimeInMs: 0,
            atkCharacteristic: {
              type: AttackCharacteristicType.PROJECTILE,
              projectile: {
                speedUnitsPerSec: 100,
                projectileRadius: 0.3,
                atkRange: MOB_TYPE_STATS.aggressive.attackRange,
              },
            },
          },
        ],
      },
    ],
  },
  {
    id: 'defensive',
    name: 'Defensive Mob',

    hp: 150,
    radius: 5,
    stats: {
      attackRange: MOB_TYPE_STATS.defensive.attackRange,
      chaseRange: MOB_TYPE_STATS.defensive.chaseRange,
    },
    atkStrategies: [
      {
        id: 'melee',
        attacks: [
          {
            atkBaseDmg: MOB_STATS.attackDamage,
            atkRadius: 0.3,
            castingTimeInMs: 0,
            atkCharacteristic: {
              type: AttackCharacteristicType.PROJECTILE,
              projectile: {
                speedUnitsPerSec: 100,
                projectileRadius: 0.3,
                atkRange: MOB_TYPE_STATS.defensive.attackRange,
              },
            },
          },
        ],
      },
    ],
  },
  {
    id: 'balanced',
    name: 'Balanced Mob',

    hp: 100,
    radius: 4,
    stats: {
      attackRange: MOB_TYPE_STATS.balanced.attackRange,
      chaseRange: MOB_TYPE_STATS.balanced.chaseRange,
    },
    atkStrategies: [
      {
        id: 'melee',
        attacks: [
          {
            atkBaseDmg: MOB_STATS.attackDamage,
            atkRadius: 0.3,
            castingTimeInMs: 0,
            atkCharacteristic: {
              type: AttackCharacteristicType.PROJECTILE,
              projectile: {
                speedUnitsPerSec: 100,
                projectileRadius: 0.3,
                atkRange: MOB_TYPE_STATS.balanced.attackRange,
              },
            },
          },
        ],
      },
    ],
  },
  // Example: Double Attack mob type
  {
    id: 'double_attacker',
    name: 'Double Attacker',

    hp: 810,
    radius: 8,
    stats: {
      attackRange: MOB_STATS.attackRange,
      chaseRange: MOB_STATS.chaseRange,
    },
    atkStrategies: [
      {
        id: 'doubleAttack',
        attacks: [
          {
            atkBaseDmg: MOB_STATS.attackDamage,
            atkRadius: 1.3,
            castingTimeInMs: 500,
            atkCharacteristic: {
              type: AttackCharacteristicType.PROJECTILE,
              projectile: {
                speedUnitsPerSec: 100,
                projectileRadius: 0.3,
                atkRange: MOB_STATS.attackRange,
              },
            },
          },
          {
            atkBaseDmg: MOB_STATS.attackDamage * 0.8, // Second hit does less damage
            atkRadius: 2.3,
            castingTimeInMs: 550, // Second attack has delay
            atkCharacteristic: {
              type: AttackCharacteristicType.PROJECTILE,
              projectile: {
                speedUnitsPerSec: 500,
                projectileRadius: 0.3,
                atkRange: MOB_STATS.attackRange,
              },
            },
          },
        ],
      },
    ],
  },
]



/**
 * Get mob type by ID
 */
export function getMobTypeById(id: string): MobTypeConfig | undefined {
  return MOB_TYPES.find((type) => type.id === id)
}

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
