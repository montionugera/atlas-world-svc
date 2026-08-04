import { readFileSync } from 'fs'
import { join } from 'path'
import { MOB_TYPES } from '../config/mobs'
import { MOB_STATS } from '../config/combatConfig'
import { createAttackStrategies } from '../config/attackStrategyFactory'
import { MAP_CONFIG } from '../config/mapConfig'
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { GameState } from '../schemas/GameState'
import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'

const REPO_ROOT = join(__dirname, '../../..')

type BestiaryDesign = { id: string; element?: string }

function bestiaryDesign(id: string): BestiaryDesign {
  const raw = readFileSync(join(REPO_ROOT, 'content/bestiary/bestiary.json'), 'utf8')
  const parsed = JSON.parse(raw) as BestiaryDesign[] | { designs: BestiaryDesign[] }
  const designs = Array.isArray(parsed) ? parsed : parsed.designs
  const found = designs.find(d => d.id === id)
  if (!found) throw new Error(`bestiary design ${id} not found`)
  return found
}

describe('Thorncrown Drake', () => {
  const drake = MOB_TYPES.find(m => m.id === 'thorncrown_drake')

  it('is registered in MOB_TYPES', () => {
    expect(drake).toBeDefined()
  })

  // Without these two non-emptiness assertions the loops below are vacuous: setting
  // `atkStrategies: []` would leave the whole suite green while the apex boss silently
  // becomes a punching bag with no attack at all. (F-029: a green suite is not a
  // covering suite.)
  it('actually has an attack kit', () => {
    expect(drake!.atkStrategies.length).toBeGreaterThan(0)
    for (const strategy of drake!.atkStrategies) {
      expect(strategy.attacks.length).toBeGreaterThan(0)
    }
  })

  it('declares only strategies the factory can build', () => {
    // attackStrategyFactory only builds 'melee', 'spear' and 'doubleAttack'.
    expect(drake!.atkStrategies.length).toBeGreaterThan(0)
    for (const strategy of drake!.atkStrategies) {
      expect(['melee', 'spear', 'doubleAttack']).toContain(strategy.id)
    }
  })

  it('carries no ATTACK element (element-entity.test.ts must stay green)', () => {
    expect(drake!.atkStrategies.length).toBeGreaterThan(0)
    for (const strategy of drake!.atkStrategies) {
      expect(strategy.attacks.length).toBeGreaterThan(0)
      for (const attack of strategy.attacks) {
        expect(attack.element ?? 'neutral').toBe('neutral')
      }
    }
  })

  it('keeps the tuned boss numbers that reach the runtime', () => {
    expect(drake!.hp).toBe(1400)
    expect(drake!.radius).toBe(9)
    expect(drake!.rotationSpeed).toBe(Math.PI / 6)
    expect(drake!.stats.attackRange).toBe(4)
    expect(drake!.atkStrategies[0].attacks[0].atkWindUpTime).toBe(800)
  })

  // F-030 regression guard. The drake is the FIRST mob whose damage differs from
  // MOB_STATS.pAtk, and `MeleeAttackStrategy` reads `attacker.pAtk` — NOT the
  // `atkBaseDmg` written on the AttackDefinition. Configuring only `atkBaseDmg` would
  // ship an apex boss that hits for 20, exactly like a trash mob, with a green suite.
  // This drives the real factory + strategy so the number is proven end to end.
  it('hits for 2.5x a wilds mob on the real melee path', () => {
    // Mirrors MobLifeCycleManager's merge: `stats.pAtk ?? MOB_STATS.pAtk`.
    // Deleting `stats.pAtk` from the definition collapses this to 20 and fails here.
    const mergedPAtk = drake!.stats.pAtk ?? MOB_STATS.pAtk
    expect(mergedPAtk).toBe(MOB_STATS.pAtk * 2.5)

    const mockGameState: any = { projectiles: new Map() }
    const mockProjectileManager: any = {
      createMelee: jest.fn((owner: any, x: number, y: number, damage: number) => ({
        id: 'proj-1',
        ownerId: owner.id,
        x,
        y,
        damage,
      })),
    }

    const strategies = createAttackStrategies(
      drake!.atkStrategies[0],
      drake!.radius as number,
      mockProjectileManager,
      mockGameState
    )
    expect(strategies).toHaveLength(1)

    const mob = new Mob({
      id: 'drake-1',
      x: 100,
      y: 100,
      radius: drake!.radius as number,
      attackRange: drake!.stats.attackRange,
      pAtk: mergedPAtk,
    })
    mob.isAlive = true
    mob.canAttack = jest.fn().mockReturnValue(true)

    const player = new Player('player-1', 'Player 1', 105, 100)
    player.isAlive = true

    expect(strategies[0].execute(mob, player, 'test-room')).toBe(true)

    const damage = mockProjectileManager.createMelee.mock.calls[0][3]
    expect(damage).toBe(MOB_STATS.pAtk * 2.5)
    expect(damage).not.toBe(MOB_STATS.pAtk)
  })

  // F-030: the roster<->runtime drift guard promised by the spec's §3.2 mitigation.
  // The earth defence element is a documented G-ELEM exception; this test makes it
  // impossible for the two sides to disagree silently.
  it('defends with the element its bestiary row declares', () => {
    const design = bestiaryDesign('mob-thorncrown-drake')
    expect(design.element).toBe('earth')
    expect(drake!.element).toBe(design.element)
  })

  it('holds the boss_area alone', () => {
    const area = MAP_CONFIG.mobSpawnAreas.find(a => a.id === 'boss_area')
    expect(area).toBeDefined()
    expect(area!.mobType).toBe('thorncrown_drake')
    expect(area!.count).toBe(1)
  })

  it('spawns with its configured hp, element and mobTypeId', () => {
    // Verified signatures: GameState is (mapId, roomId) with both defaulted;
    // MobLifeCycleManager is (roomId, state); the seed entrypoint is seedInitial().
    // GameState's constructor already builds and starts the AIModule that seedInitial needs.
    // Unlike mob-lifecycle.test.ts, this test must NOT mock ../config/mapConfig — the real
    // boss_area is the thing under test.
    const state = new GameState('map-01-sector-a', 'test-room')
    const manager = new MobLifeCycleManager('test-room', state)
    try {
      manager.seedInitial()

      // seedInitial seeds EVERY spawn area, so filter — state.mobs is not one entry.
      const spawned = [...state.mobs.values()].filter(m => m.mobTypeId === 'thorncrown_drake')
      expect(spawned).toHaveLength(1)
      expect(spawned[0].maxHealth).toBe(1400)
      expect(spawned[0].element).toBe('earth')
      expect(spawned[0].spawnAreaId).toBe('boss_area')
    } finally {
      // Started by the GameState constructor; stop it or jest reports open handles.
      // stopAI() is the teardown mob-lifecycle.test.ts's afterEach uses.
      state.stopAI()
    }
  })

  // F-023's threat table is universal — it is written on every resolved hit with no
  // mob-type condition, so the apex needs no per-boss switch. This proves the drake
  // that actually spawned gets its own table keyed by its runtime id, and that the
  // table names the attacker back.
  //
  // Verified signature: ThreatTable.best() returns `{ entityId, threat } | null`
  // (ThreatTable.ts:112), NOT a bare string — see threat-table.test.ts:24.
  it('remembers who hit it (F-023 threat)', () => {
    const state = new GameState('map-01-sector-a', 'test-room')
    const manager = new MobLifeCycleManager('test-room', state)
    try {
      manager.seedInitial()
      const drake = [...state.mobs.values()].find(m => m.mobTypeId === 'thorncrown_drake')
      expect(drake).toBeDefined()

      // A single `now` keeps the decay curve out of the assertion.
      const now = performance.now()
      state.threatRegistry
        .forAgent({ agentId: drake!.id })
        .add({ entityId: 'attacker-1', amount: 50, now })

      const table = state.threatRegistry.peek({ agentId: drake!.id })
      expect(table).not.toBeNull()
      expect(table!.valueOf({ entityId: 'attacker-1', now })).toBeCloseTo(50)
      expect(table!.best({ candidateIds: ['attacker-1'], now })?.entityId).toBe('attacker-1')

      // The table belongs to THIS agent alone: no other spawned mob inherits it.
      const otherMob = [...state.mobs.values()].find(m => m.id !== drake!.id)
      expect(otherMob).toBeDefined()
      expect(state.threatRegistry.peek({ agentId: otherMob!.id })).toBeNull()
    } finally {
      state.stopAI()
    }
  })
})
