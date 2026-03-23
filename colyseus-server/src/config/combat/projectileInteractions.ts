/**
 * Projectile / weapon interaction matrix: parry, bounce vs clash, deflect multipliers.
 */

export interface ProjectileDeflectionConfig {
  canDeflectOthers: boolean
  absorbImpulseMultiplier: number
  /** Parry damage modifier (defender weapon). Applied to projectile damage after deflect; does not change velocity. */
  deflectPowerMultiplier: number
  canBeDeflected: boolean
  deflectionBehavior: 'bounce' | 'clash'
  deflectedRangeMultiplier: number
  /** Multiplier applied to projectile.damage after a successful parry (server-only). */
  deflectedDamageMultiplier: number
}

export const WEAPON_TYPES = {
  SMALL_MELEE: 'smallMeelee',
  LARGE_MELEE: 'largeMeelee',
  PHYSIC_SPEAR: 'physicSpear',
  ARROW: 'arrow',
  MAGIC_SPEAR: 'magicSpear',
  MELEE: 'melee', // generic fallback
  SPEAR: 'spear', // generic fallback
} as const

export type ProjectileType = (typeof WEAPON_TYPES)[keyof typeof WEAPON_TYPES]

export const PROJECTILE_INTERACTIONS = {
  [WEAPON_TYPES.SMALL_MELEE]: {
    canDeflectOthers: true,
    absorbImpulseMultiplier: 0.2,
    deflectPowerMultiplier: 0.5,
    canBeDeflected: true,
    deflectionBehavior: 'clash',
    deflectedRangeMultiplier: 0,
    deflectedDamageMultiplier: 1.0,
  },
  [WEAPON_TYPES.LARGE_MELEE]: {
    canDeflectOthers: true,
    absorbImpulseMultiplier: 0.0,
    deflectPowerMultiplier: 0.8,
    canBeDeflected: true,
    deflectionBehavior: 'clash',
    deflectedRangeMultiplier: 0,
    deflectedDamageMultiplier: 1.0,
  },
  [WEAPON_TYPES.PHYSIC_SPEAR]: {
    canDeflectOthers: false,
    absorbImpulseMultiplier: 1.0,
    deflectPowerMultiplier: 1.0,
    canBeDeflected: true,
    deflectionBehavior: 'bounce',
    deflectedRangeMultiplier: 0.1,
    deflectedDamageMultiplier: 0.8,
  },
  [WEAPON_TYPES.ARROW]: {
    canDeflectOthers: false,
    absorbImpulseMultiplier: 1.0,
    deflectPowerMultiplier: 1.0,
    canBeDeflected: true,
    deflectionBehavior: 'bounce',
    deflectedRangeMultiplier: 0.3,
    deflectedDamageMultiplier: 0.3,
  },
  [WEAPON_TYPES.MAGIC_SPEAR]: {
    canDeflectOthers: false,
    absorbImpulseMultiplier: 1.0,
    deflectPowerMultiplier: 1.0,
    canBeDeflected: false,
    deflectionBehavior: 'clash',
    deflectedRangeMultiplier: 0.3,
    deflectedDamageMultiplier: 0.3,
  },
  [WEAPON_TYPES.MELEE]: {
    canDeflectOthers: true,
    absorbImpulseMultiplier: 0.2,
    deflectPowerMultiplier: 1.2,
    canBeDeflected: true,
    deflectionBehavior: 'clash',
    deflectedRangeMultiplier: 0,
    deflectedDamageMultiplier: 1.0,
  },
  [WEAPON_TYPES.SPEAR]: {
    canDeflectOthers: false,
    absorbImpulseMultiplier: 1.0,
    deflectPowerMultiplier: 1.0,
    canBeDeflected: true,
    deflectionBehavior: 'bounce',
    deflectedRangeMultiplier: 0.7,
    deflectedDamageMultiplier: 0.3,
  },
} as const satisfies Record<ProjectileType, ProjectileDeflectionConfig>
