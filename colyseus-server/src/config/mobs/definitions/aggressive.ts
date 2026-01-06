
import { MOB_STATS, MOB_TYPE_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

export const aggressive: MobTypeConfig = {
  id: 'aggressive',
  name: 'Aggressive Mob',

  hp: 90,
  radius: 3.5,
  stats: {
    attackRange: MOB_TYPE_STATS.aggressive.attackRange,
    chaseRange: MOB_TYPE_STATS.aggressive.chaseRange,
  },
  atkStrategies: [
    {
      id: 'melee',
      attacks: [
        {
          atkBaseDmg: MOB_STATS.attackDamage,
          atkRadius: 0.3,
          atkWindUpTime: 500, // 0.5s telegraph
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 0.3,
              atkRange: MOB_TYPE_STATS.aggressive.attackRange,
            },
          },
        },
      ],
    },
  ],
}
