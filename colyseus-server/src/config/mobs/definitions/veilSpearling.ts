import { MOB_STATS, SPEAR_THROWER_STATS, WEAPON_TYPES } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

/**
 * F-031 — Thornveil route-tier RANGED skirmisher, and the slice's only
 * non-earth mob: `element: 'wind'` exercises a second branch of the F-017
 * resolution table, so the slice proves more than one code path.
 *
 * Bestiary row `mob-veil-spearling` (raider / humanoid-raider / wind / ranged /
 * skirmisher / durability low / speed high). Tier `route` → factor 1.0.
 *
 * threat `ranged` ⇒ TWO strategies: a `melee` fallback for when something
 * closes, and the `spear` throw. Both damages derive from the one tier-scaled
 * constant; SPEAR_THROWER_STATS supplies only projectile PHYSICS (speed,
 * radius, range, cast time), never the damage number.
 */
const TIER_ROUTE = 1.0
const SPEARLING_PATK = MOB_STATS.pAtk * TIER_ROUTE

export const veilSpearling: MobTypeConfig = {
  id: 'veil_spearling',
  name: 'Veil Spearling',

  element: 'wind',

  hp: Math.round(70 * TIER_ROUTE), // durability low
  radius: 3, // skirmisher
  rotationSpeed: Math.PI / 2, // 90 deg/sec — quick to reface, it is built to flee
  stats: {
    pAtk: SPEARLING_PATK,
    pDef: 1,
    armor: 1,
    maxMoveSpeed: 11, // speed high
    attackRange: MOB_STATS.attackRange,
    chaseRange: 20, // skirmisher
  },
  atkStrategies: [
    {
      id: 'melee',
      attacks: [
        {
          atkBaseDmg: SPEARLING_PATK,
          atkWindUpTime: 0, // instant — the panic jab, not the real attack
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 0.3,
              atkRange: MOB_STATS.attackRange,
              projectileType: WEAPON_TYPES.PHYSIC_SPEAR,
            },
          },
        },
      ],
    },
    {
      id: 'spear',
      attacks: [
        {
          atkBaseDmg: SPEARLING_PATK,
          atkWindUpTime: SPEAR_THROWER_STATS.castTime,
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: SPEAR_THROWER_STATS.spearSpeed,
              projectileRadius: SPEAR_THROWER_STATS.projectileRadius,
              atkRange: SPEAR_THROWER_STATS.spearMaxRange,
              projectileType: WEAPON_TYPES.PHYSIC_SPEAR,
            },
          },
        },
      ],
    },
  ],
}
