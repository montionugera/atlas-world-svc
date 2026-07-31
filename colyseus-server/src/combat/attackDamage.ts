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
import { DEFAULT_ELEMENT, type Element } from '../config/combat/elements'

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

/** Outcome of resolving a skill's damage: either a usable number with its channel, or a refusal. */
export type SkillDamageResolution =
  | { ok: true; damage: number; damageType: 'physical' | 'magical' }
  | { ok: false; reason: 'no-magical-offence' | 'no-physical-offence' }

/**
 * Skill damage: physical skills scale with total P.Atk, magical with total M.Atk.
 *
 * Returns a resolution rather than a bare number so a zeroed offence stat cannot
 * masquerade as "0 damage". `derivedStats` computes mAtk as `atk * 2 * (1 - rho)`
 * and `weaponOffence` sets `rho = pAtk / (pAtk + mAtk)`, so a pure-physical blade
 * yields mAtk of exactly 0 — a blade user casting a magical skill would otherwise
 * deal no damage, silently.
 *
 * The caller decides the policy (refuse the cast, warn, substitute) — this
 * function only refuses to report a misleading number. The channel travels with
 * the damage so a skill's stat and its damage type cannot drift apart (I-037).
 *
 * Guarded on the stat being zero rather than on weapon class: the zero IS the
 * failure, and testing it directly invents no weapon-class rule, so a hybrid
 * weapon with small non-zero mAtk still works.
 */
export function getSkillDamageForKind(
  player: Player,
  kind: typeof ATTACK_KIND.SKILL_PHYSICAL | typeof ATTACK_KIND.SKILL_MAGICAL
): SkillDamageResolution {
  if (kind === ATTACK_KIND.SKILL_MAGICAL) {
    if (player.mAtk <= 0) return { ok: false, reason: 'no-magical-offence' }
    return { ok: true, damage: player.mAtk, damageType: 'magical' }
  }
  if (player.pAtk <= 0) return { ok: false, reason: 'no-physical-offence' }
  return { ok: true, damage: player.pAtk, damageType: 'physical' }
}

export type WeaponBasicProjectileParams = {
  attackKind: typeof ATTACK_KIND.WEAPON_BASIC
  projectileType: ProjectileType
  damage: number
  damageType: 'physical' | 'magical'
  /** Equipped weapon's element (World Wisdom / F-017); neutral when unarmed or unset. */
  element: Element
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
    element: weapon?.element ?? DEFAULT_ELEMENT,
    atkRange,
    pRadius,
    atkSpeed,
    meleeLifetimeMs,
  }
}
