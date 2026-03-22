/**
 * Combat Configuration
 * Centralized combat stats for players and mobs
 */
import { PROJECTILE_GRAVITY } from './physicsConfig'

export interface CombatStats {
  maxHealth: number
  pAtk: number
  mAtk: number
  attackRange: number
  atkWindDownTime: number // milliseconds (recovery after attack)
  atkWindUpTime: number // Delay before attack executes
  pDef: number
  mDef: number
  armor: number
  radius: number
  density: number
  chaseRange: number
  maxMoveSpeed: number
  // Resistances are now dynamic via MapSchema
}

export type PlayerCombatStats = CombatStats
export type MobCombatStats = CombatStats

export const PLAYER_STATS: PlayerCombatStats = {
  maxHealth: 100,
  pAtk: 25,
  mAtk: 10,
  attackRange: 3,
  atkWindDownTime: 800, // recovery time (Total Cycle ~900ms)
  atkWindUpTime: 100, // 200ms wind-up (updated to 100 per previous edit)
  pDef: 1,
  mDef: 1,
  armor: 0,
  radius: 1.3, // Player radius must not exceed 1.3
  density: 0.8,
  chaseRange: 15,
  maxMoveSpeed: 20,
} as const

export const MOB_STATS: MobCombatStats = {
  maxHealth: 100,
  pAtk: 20,
  mAtk: 0,
  attackRange: 1.5,
  atkWindDownTime: 2000,
  atkWindUpTime: 0, // Mobs usually use strategy-specific windups
  pDef: 2,
  mDef: 1,
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
    chaseRange: 15,
  },
  balanced: {
    attackRange: 1.5,
    chaseRange: 20,
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
  spearSpeed: 25, // max units/second (Reduced to ~30% of 80 per user request)
  spearDamage: 5,
  // Calculate max range using physics: sqrt(2 * h / g) * v
  // Default visual height = 2 * default mob radius (4) = 8
  // This is used for both attack decision range and projectile max travel distance
  spearMaxRange: calculateSpearMaxRange(2 * MOB_STATS.radius, PROJECTILE_GRAVITY, 25),
  castTime: 500, // ms
  projectileRadius: 0.5, // collision radius
  projectileLifetime: 3000, // ms before despawn after sticking
  deflectionSpeedBoost: 1.2, // multiplier when projectile is deflected (20% boost)
  deflectionConeAngle: Math.PI / 4, // 45 degrees in radians
} as const

// Melee projectile stats (short range, fast speed for near-instant hits)
export const MELEE_PROJECTILE_STATS = {
  meleeSpeed: 100, // Very fast speed for near-instant hit
  meleeMaxRange: 5, // Short range - just enough to hit target
  projectileRadius: 0.3, // Smaller collision radius
  projectileLifetime: 500, // Short lifetime (despawns quickly if it misses)
} as const

export interface ProjectileDeflectionConfig {
  // Defensive stats (when this projectile/weapon is used to parry/deflect something else)
  canDeflectOthers: boolean;
  absorbImpulseMultiplier: number; 
  deflectPowerMultiplier: number;  
  
  // Offensive stats (when this projectile is flying and gets parried by a defender)
  canBeDeflected: boolean;         
  deflectionBehavior: 'bounce' | 'clash'; 
deflectedRangeMultiplier: number; 
}

export const WEAPON_TYPES = {
  SMALL_MELEE: 'smallMeelee',
  LARGE_MELEE: 'largeMeelee',
  PHYSIC_SPEAR: 'physicSpear',
  ARROW: 'arrow',
  MAGIC_SPEAR: 'magicSpear',
  MELEE: 'melee', // generic fallback
  SPEAR: 'spear', // generic fallback
} as const;

export type ProjectileType = typeof WEAPON_TYPES[keyof typeof WEAPON_TYPES];

export const PROJECTILE_INTERACTIONS = {
  [WEAPON_TYPES.SMALL_MELEE]: {
    canDeflectOthers: true,
    absorbImpulseMultiplier: 0.20,
    deflectPowerMultiplier: 0.50,
    canBeDeflected: true,
    deflectionBehavior: 'clash',
    deflectedRangeMultiplier: 0,
  },
  [WEAPON_TYPES.LARGE_MELEE]: {
    canDeflectOthers: true,
    absorbImpulseMultiplier: 0.0,
    deflectPowerMultiplier: 0.80,
    canBeDeflected: true,
    deflectionBehavior: 'clash',
    deflectedRangeMultiplier: 0,
  },
  [WEAPON_TYPES.PHYSIC_SPEAR]: {
    canDeflectOthers: false,
    absorbImpulseMultiplier: 1.0, 
    deflectPowerMultiplier: 1.0,
    canBeDeflected: true,
    deflectionBehavior: 'bounce',
    deflectedRangeMultiplier: 0.80,
  },
  [WEAPON_TYPES.ARROW]: {
    canDeflectOthers: false,
    absorbImpulseMultiplier: 1.0,
    deflectPowerMultiplier: 1.0,
    canBeDeflected: true,
    deflectionBehavior: 'bounce',
    deflectedRangeMultiplier: 0.30,
  },
  [WEAPON_TYPES.MAGIC_SPEAR]: {
    canDeflectOthers: false,
    absorbImpulseMultiplier: 1.0,
    deflectPowerMultiplier: 1.0,
    canBeDeflected: false,
    deflectionBehavior: 'clash',
    deflectedRangeMultiplier: 0.30,
  },
  // Default fallbacks for currently hardcoded types in tests
  [WEAPON_TYPES.MELEE]: { // Backwards compatibility for existing tests/code
    canDeflectOthers: true,
    absorbImpulseMultiplier: 0.20,
    deflectPowerMultiplier: 1.2, 
    canBeDeflected: true,
    deflectionBehavior: 'clash',
    deflectedRangeMultiplier: 0,
  },
  [WEAPON_TYPES.SPEAR]: { // Backwards compatibility for existing tests/code
    canDeflectOthers: false,
    absorbImpulseMultiplier: 1.0, 
    deflectPowerMultiplier: 1.0,
    canBeDeflected: true,
    deflectionBehavior: 'bounce',
    deflectedRangeMultiplier: 1.0, 
  }
} as const satisfies Record<ProjectileType, ProjectileDeflectionConfig>;

export interface WeaponConfig {
  id: string
  name: string
  pAtk: number
  mAtk: number
  projectileType: ProjectileType
  range: number // weapon's effective range override
}

/** Default loadout for new players (server-only id; not synced to clients). */
export const DEFAULT_PLAYER_WEAPON_ID = 'basic_sword' as const

export const WEAPONS: Record<string, WeaponConfig> = {
  'basic_sword': {
    id: 'basic_sword',
    name: 'Basic Sword',
    pAtk: 10,
    mAtk: 0,
    projectileType: WEAPON_TYPES.MELEE,
    range: 3,
  },
  'magic_staff': {
    id: 'magic_staff',
    name: 'Magic Staff',
    pAtk: 2,
    mAtk: 15,
    projectileType: WEAPON_TYPES.MAGIC_SPEAR,
    range: 15,
  }
}
