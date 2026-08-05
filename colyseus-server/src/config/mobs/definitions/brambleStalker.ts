import { MOB_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

/**
 * F-031 — Thornveil route-tier melee skirmisher.
 *
 * Bestiary row `mob-bramble-stalker` (plant / humanoid-raider / earth / melee /
 * skirmisher / durability mid / speed high). Tier `route` → factor 1.0.
 *
 * Damage MUST sit on `stats.pAtk`: `MeleeAttackStrategy` calls
 * `createMelee(attacker, x, y, attacker.pAtk)` and never reads `atkBaseDmg`.
 * `atkBaseDmg` is kept in sync via this shared constant rather than restated —
 * the trap F-030's plan fell into (dead config, green suite).
 */
const TIER_ROUTE = 1.0
const STALKER_PATK = MOB_STATS.pAtk * TIER_ROUTE

export const brambleStalker: MobTypeConfig = {
  id: 'bramble_stalker',
  name: 'Bramble Stalker',

  element: 'earth',

  hp: Math.round(100 * TIER_ROUTE), // durability mid
  radius: 3, // skirmisher
  stats: {
    pAtk: STALKER_PATK,
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
          atkBaseDmg: STALKER_PATK,
          atkWindUpTime: 500, // 0.5s telegraph, same as the wilds baseline
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            // Inert on the melee path — `createMelee` takes MELEE_PROJECTILE_STATS
            // defaults regardless of what is written here. Required by the type.
            // Tune real reach via `stats.attackRange`, not these numbers.
            projectile: {
              speedUnitsPerSec: 100,
              projectileRadius: 0.3,
              atkRange: MOB_STATS.attackRange,
            },
          },
        },
      ],
    },
  ],
}
