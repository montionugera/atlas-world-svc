/**
 * Projectile tuning: spear thrower, melee hitboxes, range helpers.
 */
import { PROJECTILE_GRAVITY } from '../physicsConfig'
import { MOB_STATS } from './combatStats'

/**
 * Calculate spear max range based on physics: sqrt(2 * h / g) * v
 */
export function calculateSpearMaxRange(
  visualHeight: number,
  gravity: number = PROJECTILE_GRAVITY,
  speed: number = 36
): number {
  const timeToFall = Math.sqrt((2 * visualHeight) / gravity)
  return speed * timeToFall
}

export const SPEAR_THROWER_STATS = {
  spearSpeed: 25, // max units/second (Reduced to ~30% of 80 per user request)
  /** Thrown spear uses mob physical attack so hits feel consistent with melee P.Atk. */
  spearDamage: MOB_STATS.pAtk,
  spearMaxRange: calculateSpearMaxRange(2 * MOB_STATS.radius, PROJECTILE_GRAVITY, 25),
  castTime: 500, // ms
  projectileRadius: 0.5, // collision radius
  projectileLifetime: 3000, // ms before despawn after sticking
  deflectionSpeedBoost: 1.2, // multiplier when projectile is deflected (20% boost)
  deflectionConeAngle: Math.PI / 4, // 45 degrees in radians
} as const

export const MELEE_PROJECTILE_STATS = {
  meleeSpeed: 100, // Very fast speed for near-instant hit
  meleeMaxRange: 5, // Short range - just enough to hit target
  projectileRadius: 0.3, // Smaller collision radius
  projectileLifetime: 500, // Short lifetime (despawns quickly if it misses)
} as const
