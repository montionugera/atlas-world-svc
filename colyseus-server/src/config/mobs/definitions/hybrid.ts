
import { SPEAR_THROWER_STATS, MOB_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

export const hybrid: MobTypeConfig = {
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
          atkWindUpTime: 0,
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
          atkWindUpTime: SPEAR_THROWER_STATS.castTime,
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
}
