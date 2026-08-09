import { MOB_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

/**
 * F-031 — Thornveil INTERIOR-tier bruiser: the difficulty step off the route.
 *
 * Bestiary row `mob-bramble-drake` (drake / quadruped-drake / earth / melee /
 * bruiser / durability high / speed mid). Tier `interior` → factor 1.75.
 *
 * NOT a boss. `role: enemy` on its sheet, and deliberately smaller than F-030's
 * Thorncrown Drake (radius 5 vs 9, hp 263 vs 1400) — that one is the apex, is
 * hand-tuned, and is exempt from this derivation rule.
 */
const TIER_INTERIOR = 1.75
const DRAKE_PATK = MOB_STATS.pAtk * TIER_INTERIOR

export const brambleDrake: MobTypeConfig = {
  id: 'bramble_drake',
  name: 'Bramble Drake',

  element: 'earth',

  hp: Math.round(150 * TIER_INTERIOR), // durability high → 263
  radius: 5, // bruiser
  rotationSpeed: Math.PI / 3, // 60 deg/sec — heavy, but not boss-slow
  stats: {
    pAtk: DRAKE_PATK,
    pDef: 3,
    armor: 2,
    maxMoveSpeed: 8, // speed mid
    attackRange: MOB_STATS.attackRange,
    chaseRange: 25, // bruiser
  },
  atkStrategies: [
    {
      id: 'melee',
      attacks: [
        {
          atkBaseDmg: DRAKE_PATK,
          atkWindUpTime: 650, // heavier telegraph than the route mobs
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 0.4,
              atkRange: MOB_STATS.attackRange,
            },
          },
        },
      ],
    },
  ],
}
