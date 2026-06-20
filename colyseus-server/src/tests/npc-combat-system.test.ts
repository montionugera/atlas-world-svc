import { NPC } from '../schemas/NPC'
import { Mob } from '../schemas/Mob'
import { BehaviorState } from '../ai/behaviors/BehaviorState'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { AttackDefinition, AttackCharacteristicType } from '../config/mobTypesConfig'

/**
 * NPCCombatSystem was the single largest coverage hole (~3.6%) despite being a
 * near-twin of the well-covered MobCombatSystem. These tests cover the queue
 * wind-up -> execute ordering, the dead/missing-target cancellation path, and
 * the casting-state bookkeeping in enqueueAttacks. Uses jest fake timers because
 * the cast/queue scheduler runs on Date.now() (see MobCombatSystem clock note).
 */
describe('NPCCombatSystem', () => {
  let npc: NPC
  let targetMob: Mob
  let mobs: Map<string, Mob>
  let strategy: AttackStrategy & { performAttack: jest.Mock }

  const attackDef: AttackDefinition = {
    atkBaseDmg: 10,
    atkWindUpTime: 200,
    atkCharacteristic: {
      type: AttackCharacteristicType.PROJECTILE,
      projectile: { speedUnitsPerSec: 10, projectileRadius: 1, atkRange: 10 },
    },
  }

  beforeEach(() => {
    jest.useFakeTimers()
    npc = new NPC({ id: 'npc-1', ownerId: 'owner-1', x: 0, y: 0 })
    targetMob = new Mob({
      id: 'mob-1',
      x: 1,
      y: 0,
      radius: 1,
      maxHealth: 100,
      pAtk: 5,
      attackRange: 5,
      atkWindDownTime: 1000,
      pDef: 0,
      mDef: 0,
      armor: 0,
      density: 1,
    })
    mobs = new Map([[targetMob.id, targetMob]])

    strategy = {
      name: 'melee',
      getCastTime: () => 0,
      execute: jest.fn().mockReturnValue(true),
      attemptExecute: jest.fn().mockReturnValue({ canExecute: false }),
      performAttack: jest.fn(),
    } as unknown as AttackStrategy & { performAttack: jest.Mock }

    npc.currentBehavior = BehaviorState.ATTACK
    npc.currentAttackTarget = targetMob.id
    npc.attackStrategies.push(strategy)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('enqueueAttacks sets casting state when the first attack is in the future', () => {
    const now = Date.now()
    npc.combatSystem.enqueueAttacks(strategy, targetMob.id, [attackDef], now)

    expect(npc.attackQueue).toHaveLength(1)
    expect(npc.isCasting).toBe(true)
    expect(npc.castDuration).toBe(200)
    expect(npc.attackQueue[0].executionTime).toBe(now + 200)
  })

  it('does not execute the queued attack before its wind-up elapses', () => {
    const now = Date.now()
    npc.combatSystem.enqueueAttacks(strategy, targetMob.id, [attackDef], now)

    jest.setSystemTime(now + 100) // only halfway through the 200ms wind-up
    npc.combatSystem.update(16, mobs, 'room-1')

    expect(strategy.performAttack).not.toHaveBeenCalled()
    expect(npc.attackQueue).toHaveLength(1)
    expect(npc.isCasting).toBe(true)
  })

  it('executes exactly once when the wind-up elapses and drains the queue', () => {
    const now = Date.now()
    npc.combatSystem.enqueueAttacks(strategy, targetMob.id, [attackDef], now)

    jest.setSystemTime(now + 200)
    const result = npc.combatSystem.update(16, mobs, 'room-1')

    expect(strategy.performAttack).toHaveBeenCalledTimes(1)
    expect(npc.attackQueue).toHaveLength(0)
    expect(npc.isCasting).toBe(false)
    expect(result.attacked).toBe(true)
    expect(result.targetId).toBe(targetMob.id)
  })

  it('cancels the attack and switches to CHASE when the target is dead', () => {
    targetMob.die()
    const result = npc.combatSystem.update(16, mobs, 'room-1')

    expect(result.attacked).toBe(false)
    expect(npc.currentAttackTarget).toBe('')
    expect(npc.currentBehavior).toBe(BehaviorState.CHASE)
    expect(npc.currentChaseTarget).toBe('owner-1')
  })

  it('applies the attack definition cooldown as the next attackDelay', () => {
    const now = Date.now()
    const cooldownDef: AttackDefinition = { ...attackDef, atkWindUpTime: 0, cooldown: 500 }
    npc.combatSystem.enqueueAttacks(strategy, targetMob.id, [cooldownDef], now)

    jest.setSystemTime(now + 1) // wind-up is 0, so it fires on the next tick
    npc.combatSystem.update(16, mobs, 'room-1')

    expect(strategy.performAttack).toHaveBeenCalledTimes(1)
    expect(npc.attackDelay).toBe(500)
  })
})
