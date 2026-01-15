
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
          atkWindUpTime: 600,
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 30,
              projectileRadius: 1.3,
              atkRange: 15,
            },
          },
        },
        {
          atkBaseDmg: MOB_STATS.attackDamage * 2, // Second hit does less damage
          atkWindUpTime: 300, // Second attack has windup
          cooldown: 300,
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 150,
              projectileRadius: 1.3,
              atkRange: 89,
            },
          },
        },
      ],
    },
  ],
}
