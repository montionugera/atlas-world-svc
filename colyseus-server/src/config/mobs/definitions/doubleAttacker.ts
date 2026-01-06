
import { MOB_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

export const doubleAttacker: MobTypeConfig = {
  id: 'double_attacker',
  name: 'Double Attacker',

  hp: 810,
  radius: 8,
  rotationSpeed: Math.PI / 4, // 45 deg/sec
  stats: {
    attackRange: MOB_STATS.attackRange,
    chaseRange: MOB_STATS.chaseRange,
  },
  atkStrategies: [
    {
      id: 'doubleAttack',
      attacks: [
        {
          atkBaseDmg: MOB_STATS.attackDamage,
          atkRadius: 5.3,
          atkWindUpTime: 1500,
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 2.3,
              atkRange: 15, // Increased from default to allow easier casting
            },
          },
        },
        {
          atkBaseDmg: MOB_STATS.attackDamage * 0.8, // Second hit does less damage
          atkRadius: 8.3,
          atkWindUpTime: 1500, // Second attack has delay
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 8.3,
              atkRange: MOB_STATS.attackRange,
            },
          },
        },
      ],
    },
  ],
}
