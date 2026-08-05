import { readFileSync } from 'fs'
import { join } from 'path'
import { MOB_STATS } from '../config/combat/combatStats'
import { MOB_TYPES } from '../config/mobs'

// Runtime read, not a static JSON import: content/ sits outside tsc's rootDir,
// so `import bestiary from '../../../content/...'` would break the build with
// TS6059 (the F-013 lesson).
const bestiary = JSON.parse(
  readFileSync(join(__dirname, '../../../content/bestiary/bestiary.json'), 'utf8')
) as Array<Record<string, string>>

/**
 * F-031 derivation rule — the tier sets power, the bestiary row's enums set
 * shape. Restated here deliberately: the test is the executable copy of the
 * rule in docs/superpowers/specs/2026-08-05-l4-promote-monsters-design.md §4,
 * so a module that stops following it fails rather than silently drifting.
 */
const TIER = { verge: 0.75, route: 1.0, interior: 1.75, heart: 2.5 } as const
const DURABILITY = { low: 70, mid: 100, high: 150 } as const
const SPEED = { low: 5, mid: 8, high: 11 } as const
const ARCHETYPE = {
  skirmisher: { radius: 3, pDef: 1, armor: 1, chaseRange: 20 },
  bruiser: { radius: 5, pDef: 3, armor: 2, chaseRange: 25 },
  tank: { radius: 5, pDef: 4, armor: 3, chaseRange: 15 },
} as const

const CASES = [
  { mobId: 'bramble_stalker', design: 'mob-bramble-stalker', tier: 'route' },
  { mobId: 'veil_spearling', design: 'mob-veil-spearling', tier: 'route' },
  { mobId: 'bramble_drake', design: 'mob-bramble-drake', tier: 'interior' },
] as const

describe('F-031 promoted mobs follow the derivation rule', () => {
  for (const { mobId, design, tier } of CASES) {
    it(`${mobId} derives from ${design} at tier ${tier}`, () => {
      const row = bestiary.find((r) => r.id === design)
      expect(row).toBeDefined()
      const cfg = MOB_TYPES.find((m) => m.id === mobId)
      expect(cfg).toBeDefined()

      const f = TIER[tier]
      const shape = ARCHETYPE[row!.archetype as keyof typeof ARCHETYPE]

      expect(cfg!.hp).toBe(Math.round(DURABILITY[row!.durability as 'low'] * f))
      expect(cfg!.stats.pAtk).toBe(MOB_STATS.pAtk * f)
      expect(cfg!.stats.maxMoveSpeed).toBe(SPEED[row!.speed as 'low'])
      expect(cfg!.radius).toBe(shape.radius)
      expect(cfg!.stats.pDef).toBe(shape.pDef)
      expect(cfg!.stats.armor).toBe(shape.armor)
      expect(cfg!.stats.chaseRange).toBe(shape.chaseRange)

      // Defence element mirrors the bestiary row exactly.
      expect(cfg!.element).toBe(row!.element)

      // threat decides the strategy set; `zone` is unsupported until I-043.
      const ids = cfg!.atkStrategies.map((s) => s.id).sort()
      expect(ids).toEqual(row!.threat === 'ranged' ? ['melee', 'spear'] : ['melee'])
    })
  }

  it('melee damage sits on stats.pAtk, which is what the melee path actually reads', () => {
    // MeleeAttackStrategy calls createMelee(attacker, x, y, attacker.pAtk) and
    // never reads atkBaseDmg — damage placed only there is dead config.
    for (const { mobId } of CASES) {
      const cfg = MOB_TYPES.find((m) => m.id === mobId)!
      expect(cfg.stats.pAtk).toBeGreaterThan(0)
    }
  })
})
