/**
 * Characterization tests for the shared combat-scheduling seams that Phase 2
 * hoists from MobCombatSystem / NPCCombatSystem into BaseCombatSystem.
 *
 * These pin CURRENT behavior of the methods about to move:
 *   - sortStrategiesByPriority (instant-before-noninstant, then ascending range)
 *   - checkWindUpPhase (one update() completes a cast once castStartTime is far
 *     enough in the past; stays casting before that)
 *   - enqueueAttacks (casting/castDuration/first executionTime for Mob AND NPC)
 *
 * The cast/queue scheduler runs on Date.now() (see MobCombatSystem clock note),
 * so we drive it with jest fake timers + setSystemTime exactly like the existing
 * attack-queue / npc-combat-system suites.
 */
import { Mob } from '../schemas/Mob'
import { NPC } from '../schemas/NPC'
import { Player } from '../schemas/Player'
import { GameState } from '../schemas/GameState'
import { BehaviorState } from '../ai/behaviors/BehaviorState'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { AttackDefinition, AttackCharacteristicType } from '../config/mobTypesConfig'

function mockStrategy(opts: {
  name?: string
  castTime?: number
  maxRange?: number
  execute?: jest.Mock
}): AttackStrategy & { performAttack: jest.Mock; maxRange?: number } {
  return {
    name: opts.name ?? 'mock',
    maxRange: opts.maxRange,
    getCastTime: () => opts.castTime ?? 0,
    execute: opts.execute ?? jest.fn().mockReturnValue(true),
    attemptExecute: jest.fn().mockReturnValue({ canExecute: false }),
    performAttack: jest.fn(),
  } as unknown as AttackStrategy & { performAttack: jest.Mock; maxRange?: number }
}

describe('char: combat scheduling seams (Mob)', () => {
  let mob: Mob
  let gameState: GameState
  let player: Player

  beforeEach(() => {
    jest.useFakeTimers()
    gameState = new GameState('map-test', 'room-1')
    mob = new Mob({
      id: 'mob-1', x: 0, y: 0, radius: 1, maxHealth: 100, pAtk: 10,
      attackRange: 10, atkWindDownTime: 2000, pDef: 0, mDef: 0, armor: 0, density: 1,
    })
    ;(mob as any).state = gameState
    player = new Player('p1', 'Player 1', 5, 0)
    player.sessionId = 'p1'
    gameState.players.set(player.sessionId, player)
    mob.currentBehavior = 'attack'
    mob.currentAttackTarget = player.sessionId
    mob.heading = Math.atan2(player.y - mob.y, player.x - mob.x)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('sortStrategiesByPriority: instant before non-instant', () => {
    const instant = mockStrategy({ name: 'instant', castTime: 0, maxRange: 50 })
    const slow = mockStrategy({ name: 'slow', castTime: 300, maxRange: 1 })
    const sorted = (mob.combatSystem as any).sortStrategiesByPriority([slow, instant], player)
    expect(sorted.map((s: AttackStrategy) => s.name)).toEqual(['instant', 'slow'])
  })

  test('sortStrategiesByPriority: equal cast time sorts by ascending range', () => {
    const far = mockStrategy({ name: 'far', castTime: 0, maxRange: 40 })
    const near = mockStrategy({ name: 'near', castTime: 0, maxRange: 5 })
    const sorted = (mob.combatSystem as any).sortStrategiesByPriority([far, near], player)
    expect(sorted.map((s: AttackStrategy) => s.name)).toEqual(['near', 'far'])
  })

  test('checkWindUpPhase: stays casting before cast time, executes once cast elapses', () => {
    const now = Date.now()
    const execute = jest.fn().mockReturnValue(true)
    const strategy = mockStrategy({ name: 'caster', castTime: 200, execute })
    mob.attackStrategies.push(strategy)
    mob.isCasting = true
    mob.castStartTime = now
    mob.currentAttackStrategy = strategy

    // Halfway through the 200ms cast -> still casting, no execute.
    jest.setSystemTime(now + 100)
    let res = (mob.combatSystem as any).checkWindUpPhase(player, 'room-1')
    expect(res).toEqual({ attacked: false })
    expect(execute).not.toHaveBeenCalled()
    expect(mob.isCasting).toBe(true)

    // Past the cast time -> executes once, clears casting.
    jest.setSystemTime(now + 200)
    res = (mob.combatSystem as any).checkWindUpPhase(player, 'room-1')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(res.attacked).toBe(true)
    expect(mob.isCasting).toBe(false)
    expect(mob.castStartTime).toBe(0)
    expect(mob.currentAttackStrategy).toBeNull()
  })

  test('enqueueAttacks: sets casting/castDuration/first executionTime', () => {
    const now = Date.now()
    const strategy = mockStrategy({ name: 'combo' })
    const attacks: AttackDefinition[] = [
      { atkBaseDmg: 10, atkWindUpTime: 200, atkCharacteristic: { type: AttackCharacteristicType.PROJECTILE, projectile: { speedUnitsPerSec: 10, projectileRadius: 1, atkRange: 10 } } },
      { atkBaseDmg: 20, atkWindUpTime: 300, atkCharacteristic: { type: AttackCharacteristicType.PROJECTILE, projectile: { speedUnitsPerSec: 10, projectileRadius: 1, atkRange: 10 } } },
    ]
    mob.combatSystem.enqueueAttacks(strategy, 'p1', attacks, now)

    expect(mob.attackQueue.length).toBe(2)
    expect(mob.isCasting).toBe(true)
    expect(mob.castDuration).toBe(200)
    expect(mob.attackQueue[0].executionTime).toBe(now + 200)
    expect(mob.attackQueue[1].executionTime).toBe(now + 500)
    expect(mob.currentAttackStrategy).toBe(strategy)
  })

  // Characterization: the Mob queue drains AT MOST ONE due attack per update()
  // call, even when several attacks are simultaneously due. This pins the Mob's
  // original hand-rolled loop semantics through the shared processAttackQueue
  // path (maxAttacksPerTick() === 1). NPC/Player drain every due attack.
  test('processAttackQueue: fires only one attack per update() when two are simultaneously due', () => {
    const now = Date.now()
    const strategy = mockStrategy({ name: 'combo' })
    // Mob.update() only reaches the queue when it has attack strategies and a
    // live target in attack mode (set up in beforeEach).
    mob.attackStrategies.push(strategy)

    const attacks: AttackDefinition[] = [
      { atkBaseDmg: 10, atkWindUpTime: 200, atkCharacteristic: { type: AttackCharacteristicType.PROJECTILE, projectile: { speedUnitsPerSec: 10, projectileRadius: 1, atkRange: 10 } } },
      { atkBaseDmg: 20, atkWindUpTime: 300, atkCharacteristic: { type: AttackCharacteristicType.PROJECTILE, projectile: { speedUnitsPerSec: 10, projectileRadius: 1, atkRange: 10 } } },
    ]
    // Schedules executionTimes at now+200 and now+500.
    mob.combatSystem.enqueueAttacks(strategy, 'p1', attacks, now)
    expect(mob.attackQueue.length).toBe(2)

    // Advance system time past BOTH execution times so both are due at once.
    jest.setSystemTime(now + 600)

    // ONE update() tick.
    mob.updateAttack(gameState, 'room-1')

    // Exactly ONE attack fired this tick; ONE remains queued.
    expect(strategy.performAttack).toHaveBeenCalledTimes(1)
    expect(mob.attackQueue.length).toBe(1)
  })
})

describe('char: combat scheduling seams (NPC)', () => {
  let npc: NPC
  let strategy: AttackStrategy & { performAttack: jest.Mock; maxRange?: number }

  const attackDef: AttackDefinition = {
    atkBaseDmg: 10,
    atkWindUpTime: 200,
    atkCharacteristic: { type: AttackCharacteristicType.PROJECTILE, projectile: { speedUnitsPerSec: 10, projectileRadius: 1, atkRange: 10 } },
  }

  beforeEach(() => {
    jest.useFakeTimers()
    npc = new NPC({ id: 'npc-1', ownerId: 'owner-1', x: 0, y: 0 })
    strategy = mockStrategy({ name: 'melee' })
    npc.currentBehavior = BehaviorState.ATTACK
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('sortStrategiesByPriority: instant before non-instant, then ascending range', () => {
    const target = { x: 1, y: 0, radius: 1 } as any
    const instant = mockStrategy({ name: 'instant', castTime: 0, maxRange: 50 })
    const slow = mockStrategy({ name: 'slow', castTime: 300, maxRange: 1 })
    const sorted = (npc.combatSystem as any).sortStrategiesByPriority([slow, instant], target)
    expect(sorted.map((s: AttackStrategy) => s.name)).toEqual(['instant', 'slow'])

    const far = mockStrategy({ name: 'far', castTime: 0, maxRange: 40 })
    const near = mockStrategy({ name: 'near', castTime: 0, maxRange: 5 })
    const sorted2 = (npc.combatSystem as any).sortStrategiesByPriority([far, near], target)
    expect(sorted2.map((s: AttackStrategy) => s.name)).toEqual(['near', 'far'])
  })

  test('checkWindUpPhase: stays casting before cast time, executes once cast elapses', () => {
    const now = Date.now()
    const target = { id: 'mob-1', x: 1, y: 0, radius: 1, isAlive: true } as any
    const execute = jest.fn().mockReturnValue(true)
    const caster = mockStrategy({ name: 'caster', castTime: 200, execute })
    npc.isCasting = true
    npc.castStartTime = now
    npc.currentAttackStrategy = caster

    jest.setSystemTime(now + 100)
    let res = (npc.combatSystem as any).checkWindUpPhase(target, 'room-1')
    expect(res).toEqual({ attacked: false })
    expect(execute).not.toHaveBeenCalled()
    expect(npc.isCasting).toBe(true)

    jest.setSystemTime(now + 200)
    res = (npc.combatSystem as any).checkWindUpPhase(target, 'room-1')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(res.attacked).toBe(true)
    expect(npc.isCasting).toBe(false)
    expect(npc.castStartTime).toBe(0)
    expect(npc.currentAttackStrategy).toBeNull()
  })

  test('enqueueAttacks: sets casting/castDuration/first executionTime', () => {
    const now = Date.now()
    npc.combatSystem.enqueueAttacks(strategy, 'mob-1', [attackDef], now)

    expect(npc.attackQueue).toHaveLength(1)
    expect(npc.isCasting).toBe(true)
    expect(npc.castDuration).toBe(200)
    expect(npc.attackQueue[0].executionTime).toBe(now + 200)
    expect(npc.currentAttackStrategy).toBe(strategy)
  })
})
