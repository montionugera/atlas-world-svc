import { MOB_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

/**
 * F-030 — the Thornveil apex predator (bestiary id `mob-thorncrown-drake`, band 51-60).
 *
 * Boss-ness is expressed as tuned numbers plus a solo `boss_area` footprint, the same
 * pattern `double_attacker` already ships. F-023's threat table needs no switch: it is
 * written on every resolved hit and falls back to nearest-target when empty.
 *
 * `element: 'earth'` mirrors the bestiary row. That is a knowing exception to G-ELEM
 * ("a boss must be element-neutral in BOTH directions") — see
 * docs/superpowers/specs/2026-08-04-l3-boss-design.md section 3.2. Do not change it to
 * neutral or void without revisiting that decision.
 */
export const thorncrownDrake: MobTypeConfig = {
  id: 'thorncrown_drake',
  name: 'Thorncrown Drake',

  element: 'earth',

  hp: 1400,
  radius: 9,
  rotationSpeed: Math.PI / 6, // 30 deg/sec — a barn-sized drake turns slowly; the turn IS the tell
  stats: {
    attackRange: 4,
    chaseRange: 30,
    pDef: 6,
    armor: 3,
    maxMoveSpeed: 7,
  },
  atkStrategies: [
    {
      id: 'melee',
      attacks: [
        {
          atkBaseDmg: MOB_STATS.pAtk * 2.5,
          atkWindUpTime: 800, // heavy telegraph — readable at boss scale
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 0.6,
              atkRange: 4,
            },
          },
        },
      ],
    },
  ],
}
