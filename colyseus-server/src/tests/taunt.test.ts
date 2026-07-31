import { addPlayerAt, buildTestRoom, makeUnkillable, spawnRealMob, TestEnv } from './f018-harness'

describe('taunt', () => {
  let env: TestEnv

  beforeEach(() => {
    jest.useFakeTimers()
    env = buildTestRoom('taunt')
  })

  afterEach(() => {
    env.dispose()
    jest.useRealTimers()
  })

  it('puts the taunter on top of a table led by someone else', () => {
    const cx = env.state.width / 2
    const cy = env.state.height / 2
    const mob = spawnRealMob(env, cx, cy)
    makeUnkillable(mob)
    const dps = addPlayerAt(env, 'dps', cx + 3, cy)
    const tank = addPlayerAt(env, 'tank', cx + 9, cy)
    makeUnkillable(dps)
    makeUnkillable(tank)

    const now = performance.now()
    env.state.threatRegistry
      .forAgent({ agentId: mob.id })
      .add({ entityId: dps.id, amount: 1000, now })

    env.battleManager.applyTaunt({
      tauntingEntityId: tank.id,
      targetAgentId: mob.id,
    })

    const table = env.state.threatRegistry.forAgent({ agentId: mob.id })
    expect(table.tauntedTarget({ now: performance.now() })).toBe(tank.id)
    expect(table.best({ candidateIds: [dps.id, tank.id], now: performance.now() })?.entityId).toBe(
      tank.id
    )
  })

  it('is a no-op against an agent with no table rather than throwing', () => {
    expect(() =>
      env.battleManager.applyTaunt({
        tauntingEntityId: 'someone',
        targetAgentId: 'no-such-mob',
      })
    ).not.toThrow()
  })
})
