import { Encoder, StateView } from '@colyseus/schema'
import { InterestManager } from '../../interest/InterestManager'
import { createDistancePredicate } from '../../interest/visibility'
import { buildTestRoom, addPlayerAt, spawnRealMob } from '../f018-harness'
import type { GameState } from '../../schemas/GameState'
import type { InterestEntity } from '../../interest/InterestManager'

function collectFrom(state: GameState): InterestEntity[] {
  const out: InterestEntity[] = []
  for (const [sessionId, p] of state.players.entries()) {
    out.push({ id: sessionId, x: p.x, y: p.y, ref: p })
  }
  for (const m of state.mobs.values()) out.push({ id: m.id, x: m.x, y: m.y, ref: m })
  return out
}

describe('AOI bandwidth', () => {
  let env: ReturnType<typeof buildTestRoom>

  afterEach(() => env.dispose())

  it('encodes materially fewer bytes for a filtered view than for the full state', () => {
    env = buildTestRoom('room-bandwidth')
    env.state.clearAllMobs()

    const player = addPlayerAt(env, 's1', 50, 50)

    // 2 mobs inside a 100-unit radius, 198 far outside it. Keep every mob inside
    // the world bounds (state.width/height) or physics body creation may reject it.
    //
    // MobLifeCycleManager.spawnMobAt() ids mobs as `mob-debug-${state.tick}-${rand2}`
    // with only a 2-char base36 suffix (1296 combos). This harness never advances
    // state.tick (no tickRoom() calls), so 200 spawns at a fixed tick collide via
    // the birthday paradox (~15 collisions observed empirically) and
    // spawnRealMob() throws when a collision overwrites an existing id. Advancing
    // tick per spawn keeps every id unique; tick has no other effect here since
    // GameSimulationSystem.update() is never invoked in this test.
    for (let i = 0; i < 2; i++) {
      env.state.tick = i + 1
      spawnRealMob(env, 60 + i, 50)
    }
    for (let i = 0; i < 198; i++) {
      env.state.tick = i + 3
      spawnRealMob(env, 500 + (i % 40) * 10, 500 + Math.floor(i / 40) * 2)
    }

    const im = new InterestManager({
      predicate: createDistancePredicate({ radius: 100, hysteresis: 1.15 }),
      cellSize: 100,
      candidateRadius: 115,
    })
    const view = new StateView()
    im.attach('s1', view, 's1')
    im.update(collectFrom(env.state), [{ sessionId: 's1', x: player.x, y: player.y }])

    // Sanity: the visible set really is small before measuring bytes. Without
    // this the byte assertion could pass for the wrong reason.
    expect(im.visibleIdsFor('s1').size).toBe(3) // self + 2 near mobs
    expect(env.state.mobs.size).toBe(200)

    // All five root collections carry `@view()` (Task 3), so an unfiltered
    // `encoder.encodeAll()` no longer touches player/mob data at all -- fields
    // tagged `@view()` are routed into each ChangeTree's `filteredChanges` /
    // `allFilteredChanges` buckets, never `changes` / `allChanges`. Comparing
    // against `encodeAll()` as "the full state" would compare AOI's 3-entity
    // view against a baseline that structurally excludes every entity (a few
    // scalar fields only) -- backwards, and it would flip green when @view()
    // is removed (encodeAllView degenerates to 0 while encodeAll suddenly
    // includes everything). The correct "no AOI" baseline is a StateView with
    // every entity explicitly added, measured through the same
    // `encodeAllView` path real per-client views use.
    const fullView = new StateView()
    for (const entity of collectFrom(env.state)) fullView.add(entity.ref as never)

    const encoder = new Encoder(env.state)
    const shared = encoder.encodeAll()
    const full = encoder.encodeAllView(fullView, shared.byteLength, { offset: 0 })
    const filtered = encoder.encodeAllView(view, shared.byteLength, { offset: 0 })

    // 3 of 201 entities visible. Half the bytes is a deliberately loose floor:
    // it catches "filtering silently does nothing" without making the test
    // brittle against encoder framing changes.
    expect(filtered.byteLength).toBeLessThan(full.byteLength * 0.5)
  })
})
