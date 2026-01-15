
import { MobCombatStats } from '../combatConfig'

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

  /** Casting time (wind up) in milliseconds before attack executes */
  atkWindUpTime: number
  /** Optional: Cooldown in milliseconds after this specific attack (overrides mob's default attackDelay) */
  cooldown?: number
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
  /** Rotation speed in radians per second (default: PI = 180 deg/sec) */
  rotationSpeed?: number
  /** Base combat stats (overrides MOB_STATS defaults) */
  stats: Partial<MobCombatStats>
  /** Attack strategies this mob can use */
  atkStrategies: AttackStrategyConfig[]
}
