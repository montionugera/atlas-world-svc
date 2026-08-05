import { readFileSync } from 'fs'
import { join } from 'path'
import { MOB_STATS } from '../config/combat/combatStats'
import { MOB_TYPES } from '../config/mobs'
import { MAP_CONFIG } from '../config/mapConfig'
import { GameState } from '../schemas/GameState'
import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'
import { BattleModule } from '../modules/BattleModule'
import { ProjectileManager } from '../modules/ProjectileManager'

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

  it('each promoted mob has a runtime spawn area, so it can actually appear', () => {
    // THE point of this test: everything above passes on config alone. F-029
    // and F-030 both shipped suites that stayed green with the spawn wiring
    // removed, because they asserted against hand-built objects. This one
    // reads the real MAP_CONFIG, so deleting the mapConfig.ts entries turns it
    // red — verified by doing exactly that.
    for (const { mobId } of CASES) {
      const area = MAP_CONFIG.mobSpawnAreas.find((a) => a.mobType === mobId)
      expect(area).toBeDefined()
      expect(area!.count).toBeGreaterThan(0)
    }
  })

  it('melee damage sits on stats.pAtk, which is what the melee path actually reads', () => {
    // MeleeAttackStrategy calls createMelee(attacker, x, y, attacker.pAtk) and
    // never reads atkBaseDmg — damage placed only there is dead config.
    for (const { mobId } of CASES) {
      const cfg = MOB_TYPES.find((m) => m.id === mobId)!
      expect(cfg.stats.pAtk).toBeGreaterThan(0)
    }
  })
})

/**
 * The real spawn path, not the config. Same harness F-030 used for the boss:
 * GameState is (mapId, roomId); MobLifeCycleManager is (roomId, state); the
 * seed entrypoint is seedInitial(). Must NOT mock ../config/mapConfig — the
 * real spawn areas are the thing under test.
 */
describe('F-031 promoted mobs reach a real room through the real spawn path', () => {
  const EXPECTED = [
    { mobId: 'bramble_stalker', areaId: 'thornveil_route_stalkers', count: 2, hp: 100, element: 'earth' },
    { mobId: 'veil_spearling', areaId: 'thornveil_route_spearlings', count: 2, hp: 70, element: 'wind' },
    { mobId: 'bramble_drake', areaId: 'thornveil_interior', count: 1, hp: 263, element: 'earth' },
  ] as const

  it('seeds each one with its configured hp, element, area and population', () => {
    const state = new GameState('map-01-sector-a', 'test-room')
    const manager = new MobLifeCycleManager('test-room', state)
    try {
      manager.seedInitial()
      for (const { mobId, areaId, count, hp, element } of EXPECTED) {
        // seedInitial seeds EVERY area, so filter — state.mobs is not one entry.
        const spawned = [...state.mobs.values()].filter((m) => m.mobTypeId === mobId)
        expect(spawned).toHaveLength(count)
        for (const mob of spawned) {
          expect(mob.maxHealth).toBe(hp)
          expect(mob.element).toBe(element)
          expect(mob.spawnAreaId).toBe(areaId)
        }
      }
    } finally {
      // Started by the GameState constructor; stop it or jest reports open handles.
      state.stopAI()
    }
  })

  it('gives each one a built attack strategy, so it can fight rather than just stand', () => {
    // The factory silently produces NOTHING for an unbuildable strategy id
    // (it only console.warns for AREA), so a mob can spawn and never attack.
    // This asserts the strategies were actually CONSTRUCTED on the spawned
    // entity — which needs a real ProjectileManager: without one,
    // buildAttackStrategies bails at MobLifeCycleManager.ts:229 and every mob
    // silently gets zero strategies.
    const state = new GameState('map-01-sector-a', 'test-room')
    const manager = new MobLifeCycleManager('test-room', state)
    manager.setProjectileManager(new ProjectileManager(state, new BattleModule(state)))
    try {
      manager.seedInitial()
      for (const { mobId } of EXPECTED) {
        const mob = [...state.mobs.values()].find((m) => m.mobTypeId === mobId)
        expect(mob).toBeDefined()
        expect(mob!.attackStrategies.length).toBeGreaterThan(0)
      }
      // veil_spearling is the ranged one: it must get BOTH melee and spear.
      const spearling = [...state.mobs.values()].find((m) => m.mobTypeId === 'veil_spearling')
      expect(spearling!.attackStrategies.length).toBe(2)
    } finally {
      state.stopAI()
    }
  })
})
