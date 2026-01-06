
import { MOB_STATS, MOB_TYPE_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

export const balanced: MobTypeConfig = {
  id: 'balanced',
  name: 'Balanced Mob',

  hp: 100,
  radius: 4,
  stats: {
    attackRange: MOB_TYPE_STATS.balanced.attackRange,
    chaseRange: MOB_TYPE_STATS.balanced.chaseRange,
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
              atkRange: MOB_TYPE_STATS.balanced.attackRange,
            },
          },
        },
      ],
    },
  ],
}
