
import { MOB_STATS, MOB_TYPE_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

export const defensive: MobTypeConfig = {
  id: 'defensive',
  name: 'Defensive Mob',

  hp: 150,
  radius: 5,
  stats: {
    attackRange: MOB_TYPE_STATS.defensive.attackRange,
    chaseRange: MOB_TYPE_STATS.defensive.chaseRange,
  },
  atkStrategies: [
    {
      id: 'melee',
      attacks: [
        {
          atkBaseDmg: MOB_STATS.attackDamage,
          atkWindUpTime: 500, // 0.5s telegraph
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 0.3,
              atkRange: MOB_TYPE_STATS.defensive.attackRange,
            },
          },
        },
      ],
    },
  ],
}
