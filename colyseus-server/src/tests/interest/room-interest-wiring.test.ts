import { StateView } from '@colyseus/schema'
import { InterestManager } from '../../interest/InterestManager'
import { createDistancePredicate } from '../../interest/visibility'
import { collectInterestEntities as collectFrom } from '../../interest/collect'
import { buildTestRoom, addPlayerAt, spawnRealMob } from '../f018-harness'

/**
 * GameRoom.maxClients is 1, so this exercises the collect + update contract
 * against a directly-built room rather than connected clients — the same
 * approach as game-simulation-integration.test.ts and f018-harness.ts.
 *
 * buildTestRoom() returns a TestEnv (`.room`, `.state`, `.sim`, ..., `.dispose()`),
 * NOT a bare room. addPlayerAt() and spawnRealMob() are existing harness helpers;
 * both place the entity deterministically and sync its physics body, which
 * state.addPlayer() alone does not (it always spawns at map centre).
 *
 * Uses the shared collectInterestEntities() from interest/collect.ts (the same
 * collector GameRoom delegates to) so this test asserts the real shape, not a
 * hand-rolled copy that can drift.
 */

describe('room interest wiring', () => {
  let env: ReturnType<typeof buildTestRoom>

  afterEach(() => env.dispose())

  it('collects players as interest entities keyed by session id, with schema refs', () => {
    env = buildTestRoom('room-interest-1')
    const player = addPlayerAt(env, 's1', 100, 100)

    const entities = collectFrom(env.state)
    const playerEntry = entities.find(e => e.id === 's1')

    expect(playerEntry).toBeDefined()
    expect(playerEntry!.ref).toBe(player)
    expect(playerEntry!.x).toBe(100)
  })

  it('a viewer sees a near mob and not a far one', () => {
    env = buildTestRoom('room-interest-2')
    env.state.clearAllMobs()

    const player = addPlayerAt(env, 's1', 100, 100)
    const near = spawnRealMob(env, 150, 100)
    const far = spawnRealMob(env, 900, 900)

    const im = new InterestManager({
      predicate: createDistancePredicate({ radius: 100, hysteresis: 1.15 }),
      cellSize: 100,
      candidateRadius: 115,
    })
    im.attach('s1', new StateView(), 's1')

    im.update(collectFrom(env.state), [{ sessionId: 's1', x: player.x, y: player.y }])

    const visible = im.visibleIdsFor('s1')
    expect(visible.has('s1')).toBe(true)
    expect(visible.has(near.id)).toBe(true)
    expect(visible.has(far.id)).toBe(false)
  })
})
