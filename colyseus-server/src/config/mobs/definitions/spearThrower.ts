
import { SPEAR_THROWER_STATS, MOB_STATS, WEAPON_TYPES } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

export const spearThrower: MobTypeConfig = {
  id: 'spear_thrower',
  name: 'Spear Thrower',

  hp: 80,
  radius: 3,
  rotationSpeed: Math.PI / 2, // 90 deg/sec
  stats: {
    attackRange: MOB_STATS.attackRange,
    chaseRange: 20, // Longer chase range - prefers ranged combat
  },
  atkStrategies: [
    {
      id: 'melee',
      attacks: [
        {
          atkBaseDmg: MOB_STATS.pAtk,
          atkWindUpTime: 0, // Instant
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
          atkBaseDmg: SPEAR_THROWER_STATS.spearDamage,
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
