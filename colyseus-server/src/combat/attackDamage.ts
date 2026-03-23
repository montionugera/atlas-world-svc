/**
 * Server-only attack classification and damage resolution.
 * Player.pAtk / Player.mAtk are totals (base + weapon); skills use the appropriate total.
 */
import {
  WEAPONS,
  WEAPON_TYPES,
  MELEE_PROJECTILE_STATS,
  type ProjectileType,
  type WeaponConfig,
} from '../config/combatConfig'
import type { Player } from '../schemas/Player'

export const ATTACK_KIND = {
  WEAPON_BASIC: 'weapon_basic',
  SKILL_PHYSICAL: 'skill_physical',
  SKILL_MAGICAL: 'skill_magical',
} as const

export type AttackKind = (typeof ATTACK_KIND)[keyof typeof ATTACK_KIND]

export function getWeaponConfigForPlayer(player: Player): WeaponConfig | undefined {
  if (!player.equippedWeaponId) return undefined
  return WEAPONS[player.equippedWeaponId]
}

export function isWeaponMagicalPrimary(weapon: WeaponConfig | undefined): boolean {
  if (!weapon) return false
  return weapon.mAtk > weapon.pAtk
}

/** Skill damage: physical skills scale with total P.Atk; magical with total M.Atk. */
export function getSkillDamageForKind(
  player: Player,
  kind: typeof ATTACK_KIND.SKILL_PHYSICAL | typeof ATTACK_KIND.SKILL_MAGICAL
): number {
  return kind === ATTACK_KIND.SKILL_MAGICAL ? player.mAtk : player.pAtk
}

export type WeaponBasicProjectileParams = {
  attackKind: typeof ATTACK_KIND.WEAPON_BASIC
  projectileType: ProjectileType
  damage: number
  damageType: 'physical' | 'magical'
  atkRange: number
  pRadius: number
  atkSpeed: number
  /** Melee: stick lifetime + flying cap (see Projectile.maxAirLifeMs). Ranged: unused. */
  meleeLifetimeMs: number
}

/** Resolves weapon basic attack projectile parameters from equipped weapon + player totals. */
export function resolveWeaponBasicProjectileParams(player: Player): WeaponBasicProjectileParams {
  const weapon = getWeaponConfigForPlayer(player)
  let projectileType: ProjectileType = WEAPON_TYPES.MELEE
  let damage = player.pAtk
  let damageType: 'physical' | 'magical' = 'physical'
  let atkRange = player.attackRange + player.radius
  let pRadius = 2.0
  let atkSpeed = 40
  let meleeLifetimeMs: number = MELEE_PROJECTILE_STATS.projectileLifetime

  if (weapon) {
    projectileType = weapon.projectileType
    atkRange = weapon.range + player.radius
    if (isWeaponMagicalPrimary(weapon)) {
      damage = player.mAtk
      damageType = 'magical'
      pRadius = 0.5
      atkSpeed = 100
    } else if (weapon.projectileType === WEAPON_TYPES.ARROW) {
      pRadius = 0.25
      atkSpeed = 85
    } else if (weapon.projectileType === WEAPON_TYPES.MELEE) {
      pRadius = weapon.pRadius ?? 2.0
    } else if (weapon.projectileType === WEAPON_TYPES.SMALL_MELEE) {
      pRadius = weapon.pRadius ?? 1.0
      atkSpeed = 115
      meleeLifetimeMs = 220
    } else if (weapon.projectileType === WEAPON_TYPES.LARGE_MELEE) {
      pRadius = weapon.pRadius ?? 1.55
      atkSpeed = 85
      meleeLifetimeMs = 360
    }
  }

  return {
    attackKind: ATTACK_KIND.WEAPON_BASIC,
    projectileType,
    damage,
    damageType,
    atkRange,
    pRadius,
    atkSpeed,
    meleeLifetimeMs,
  }
}
