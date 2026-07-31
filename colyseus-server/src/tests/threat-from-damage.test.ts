import {
  addPlayerAt,
  buildTestRoom,
  enqueueHit,
  makeUnkillable,
  spawnRealMob,
  TestEnv,
  tickRoom,
  TICK_MS,
} from './f018-harness'

describe('threat accrues from resolved hits', () => {
  let env: TestEnv

  beforeEach(() => {
    jest.useFakeTimers()
    env = buildTestRoom('threat-damage')
  })

  afterEach(() => {
    env.dispose()
    jest.useRealTimers()
  })

  it('credits the attacker in the target mob threat table', async () => {
    const cx = env.state.width / 2
    const cy = env.state.height / 2
    const mob = spawnRealMob(env, cx, cy)
    makeUnkillable(mob)
    const player = addPlayerAt(env, 'p1', cx + 3, cy)
    makeUnkillable(player)

    // The established path: queue the hit, then tick so processActionMessages drains it.
    enqueueHit(env, player, mob, 25)
    for (let t = 0; t < 10; t++) await tickRoom(env, TICK_MS)

    const table = env.state.threatRegistry.peek({ agentId: mob.id })
    expect(table).not.toBeNull()
    expect(table!.valueOf({ entityId: player.id, now: performance.now() })).toBeGreaterThan(0)
  })

  it('leaves the mob with no threat from a player that never hit it', async () => {
    const cx = env.state.width / 2
    const cy = env.state.height / 2
    const mob = spawnRealMob(env, cx, cy)
    makeUnkillable(mob)
    const player = addPlayerAt(env, 'p2', cx + 3, cy)
    makeUnkillable(player)

    for (let t = 0; t < 10; t++) await tickRoom(env, TICK_MS)

    const table = env.state.threatRegistry.peek({ agentId: mob.id })
    const value = table?.valueOf({ entityId: player.id, now: performance.now() }) ?? 0
    expect(value).toBe(0)
  })
})
