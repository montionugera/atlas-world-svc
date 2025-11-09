/**
 * Combat Configuration
 * Centralized combat stats for players and mobs
 */
import { PROJECTILE_GRAVITY } from './physicsConfig'

export interface PlayerCombatStats {
  maxHealth: number
  attackDamage: number
  attackRange: number
  attackDelay: number // milliseconds
  defense: number
  armor: number
  radius: number
  density: number
}

export interface MobCombatStats {
  maxHealth: number
  attackDamage: number
  attackRange: number
  attackDelay: number // milliseconds
  defense: number
  armor: number
  radius: number
  density: number
  chaseRange: number
  maxMoveSpeed: number
}

export const PLAYER_STATS: PlayerCombatStats = {
  maxHealth: 100,
  attackDamage: 25,
  attackRange: 3,
  attackDelay: 1000,
  defense: 1,
  armor: 0,
  radius: 4,
  density: 0.8,
} as const

export const MOB_STATS: MobCombatStats = {
  maxHealth: 100,
  attackDamage: 2,
  attackRange: 1.5,
  attackDelay: 2000,
  defense: 2,
  armor: 1,
  radius: 4,
  density: 1.2,
  chaseRange: 15,
  maxMoveSpeed: 8,
} as const

// Mob type variations (for randomized mobs)
export const MOB_TYPE_STATS = {
  aggressive: {
    attackRange: 2.5,
    chaseRange: 25,
  },
  defensive: {
    attackRange: 1.0,
    chaseRange: 10,
  },
  balanced: {
    attackRange: 1.5,
    chaseRange: 15,
  },
} as const

/**
 * Calculate spear max range based on physics: sqrt(2 * h / g) * v
 * @param visualHeight - Visual height of spear (typically mob.radius * 2)
 * @param gravity - Gravity constant (default: PROJECTILE_GRAVITY)
 * @param speed - Projectile speed (default: SPEAR_THROWER_STATS.spearSpeed)
 * @returns Maximum range the projectile can travel
 */
export function calculateSpearMaxRange(
  visualHeight: number,
  gravity: number = PROJECTILE_GRAVITY,
  speed: number = 36
): number {
  // Time to fall: t = sqrt(2 * h / g)
  const timeToFall = Math.sqrt((2 * visualHeight) / gravity)
  // Range: R = v * t
  return speed * timeToFall
}

// Spear thrower mob stats
export const SPEAR_THROWER_STATS = {
  spearSpeed: 36, // max units/second
  spearDamage: 5,
  // Calculate max range using physics: sqrt(2 * h / g) * v
  // Default visual height = 2 * default mob radius (4) = 8
  // This is used for both attack decision range and projectile max travel distance
  spearMaxRange: calculateSpearMaxRange(2 * MOB_STATS.radius, PROJECTILE_GRAVITY, 36),
  windUpTime: 500, // ms
  projectileRadius: 0.5, // collision radius
  projectileLifetime: 2000, // ms before despawn after sticking
  deflectionSpeedBoost: 1.2, // multiplier when projectile is deflected (20% boost)
  deflectionConeAngle: Math.PI / 4, // 45 degrees in radians
} as const

