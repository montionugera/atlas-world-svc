import { MOB_STATS } from '../../combatConfig'
import { AttackCharacteristicType, MobTypeConfig } from '../types'

/**
 * The drake's headline damage: 2.5x a wilds mob.
 *
 * It MUST live on `stats.pAtk`, because that is the only field the melee path actually
 * consumes: `MobLifeCycleManager` merges `stats.pAtk ?? MOB_STATS.pAtk` into `Mob.pAtk`,
 * and `MeleeAttackStrategy.execute` calls `createMelee(attacker, x, y, attacker.pAtk)` —
 * it never reads `atkBaseDmg`. Omitting `stats.pAtk` silently drops the boss to 20.
 * (`atkBaseDmg` IS honoured by the `spear` and `doubleAttack` strategies, so it is kept
 * in sync here via this shared constant rather than restated as a literal.)
 */
const DRAKE_PATK = MOB_STATS.pAtk * 2.5

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
    pAtk: DRAKE_PATK,
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
          atkBaseDmg: DRAKE_PATK,
          atkWindUpTime: 800, // heavy telegraph — readable at boss scale
          atkCharacteristic: {
            type: AttackCharacteristicType.PROJECTILE,
            // NOTE: these three are required by `AttackProjectile` but are INERT on the
            // melee path. `MeleeAttackStrategy` passes only 4 args to `createMelee`, so
            // the projectile takes MELEE_PROJECTILE_STATS defaults (radius 0.3, speed
            // 100) regardless of what is written here, and `calculateEffectiveAttackRange`
            // is never called for `melee`. Real reach is `stats.attackRange` + both radii.
            // Tune the drake's reach via `stats.attackRange`, not these numbers.
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
