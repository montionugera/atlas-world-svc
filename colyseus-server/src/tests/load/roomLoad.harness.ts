/**
 * Stage 1 load harness — measures the single-room capacity ceiling.
 *
 * Exists to answer spec risk R1: no load test exists, so the bottleneck that
 * motivates sharding has never been measured. The capacity table this prints
 * is what sets `cellSize` for Stage 3. Do not guess that number.
 *
 * Hand-rolled in-process rather than using @colyseus/testing: that package is
 * not installed, and colyseus.js is pinned ^0.16.19 against a 0.17 server
 * (package.json:34). buildTestRoom() drives the real ordered pass without
 * needing connected clients.
 *
 * NOTE: this calls `env.sim.update(ms)` directly and NOT the harness's
 * `tickRoom()`. `tickRoom` calls `jest.advanceTimersByTime` (f018-harness.ts),
 * and `jest` does not exist under ts-node — using it here throws ReferenceError.
 * The trade-off is that timer-driven work (cooldowns scheduled via setTimeout)
 * does not advance, so these numbers measure the per-tick simulation cost, not
 * timer-driven behaviour.
 *
 * Importing f018-harness under ts-node IS safe: `jest.` appears exactly once in
 * that file, inside tickRoom's body, with no top-level jest usage and no jest
 * import. Never call tickRoom from here and the module loads fine.
 *
 * Mob-id collision workaround: MobLifeCycleManager.spawnMobAt() ids mobs as
 * `mob-debug-${state.tick}-${rand2}`, a 2-char base36 suffix (1,296 combos) at
 * whatever tick is current. Spawning hundreds of mobs at a fixed tick collides
 * via the birthday paradox (~15 collisions observed at 200 spawns in the Task 5
 * bandwidth test), and spawnRealMob() throws when a collision means no new key
 * appeared. This harness advances `state.tick` once per spawn to keep ids
 * unique — a real production weakness being worked around, not fixed. See
 * MobLifeCycleManager.spawnMobAt.
 *
 * Run: npm run load
 */
import { performance } from 'perf_hooks'
import { Encoder, StateView } from '@colyseus/schema'
import { buildTestRoom, addPlayerAt, spawnRealMob } from '../f018-harness'
import { InterestManager, InterestEntity } from '../../interest/InterestManager'
import { createDistancePredicate } from '../../interest/visibility'
import { AOI_CONFIG } from '../../config/aoiConfig'
import { GAME_CONFIG } from '../../config/gameConfig'
import type { GameState } from '../../schemas/GameState'

export interface CapacityRow {
  players: number
  mobs: number
  tickP50: number
  tickP95: number
  tickP99: number
  bytesPerClient: number
  heapMb: number
  withinBudget: boolean
}

function collect(state: GameState): InterestEntity[] {
  const out: InterestEntity[] = []
  for (const [sessionId, p] of state.players.entries()) {
    out.push({ id: sessionId, x: p.x, y: p.y, ref: p })
  }
  for (const m of state.mobs.values()) out.push({ id: m.id, x: m.x, y: m.y, ref: m })
  for (const n of state.npcs.values()) out.push({ id: n.id, x: n.x, y: n.y, ref: n })
  for (const pr of state.projectiles.values()) {
    out.push({ id: pr.id, x: pr.x, y: pr.y, ref: pr })
  }
  return out
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

// 300 ticks made the heaviest points (300 players / 1000 mobs, already `OVER`
// budget) run past the ~30s-per-point guideline in this repo's environment
// (measured: 20 ticks at that point took ~3s wall clock -> 300 ticks would be
// ~45s+). Reduced to 100 per the brief's own fallback instruction.
export function runOnePoint(players: number, mobs: number, ticks = 100): CapacityRow {
  const env = buildTestRoom(`load-${players}p-${mobs}m`)
  try {
    env.state.clearAllMobs()

    const im = new InterestManager({
      predicate: createDistancePredicate({
        radius: AOI_CONFIG.radius,
        hysteresis: AOI_CONFIG.hysteresis,
      }),
      cellSize: AOI_CONFIG.cellSize,
      candidateRadius: AOI_CONFIG.radius * AOI_CONFIG.hysteresis,
    })

    const views: StateView[] = []
    for (let i = 0; i < players; i++) {
      const sessionId = `load-s${i}`
      addPlayerAt(env, sessionId, Math.random() * env.state.width, Math.random() * env.state.height)
      const view = new StateView()
      views.push(view)
      im.attach(sessionId, view, sessionId)
    }

    // Advance tick per spawn — see the file header on the mob-id collision trap.
    for (let i = 0; i < mobs; i++) {
      env.state.tick = i + 1
      spawnRealMob(env, Math.random() * env.state.width, Math.random() * env.state.height)
    }

    const durations: number[] = []
    for (let t = 0; t < ticks; t++) {
      const started = performance.now()
      // Direct sim.update, not tickRoom — see the file header for why.
      env.sim.update(GAME_CONFIG.tickRate)
      im.update(
        collect(env.state),
        [...env.state.players.entries()].map(([sessionId, p]) => ({
          sessionId,
          x: p.x,
          y: p.y,
        }))
      )
      durations.push(performance.now() - started)
    }

    // Snapshot bytes: encodeAll() first to establish the untagged-field offset
    // (all five root collections carry @view(), so encodeAll() alone only sees
    // ~37 bytes of scalars — it is NOT the per-client figure), then encode one
    // representative client's actual filtered StateView via encodeAllView().
    // Same pattern as the Task 5 bandwidth test (bandwidth.test.ts).
    const encoder = new Encoder(env.state)
    const shared = encoder.encodeAll()
    const bytesPerClient =
      views.length > 0
        ? encoder.encodeAllView(views[0], shared.byteLength, { offset: 0 }).byteLength
        : 0

    durations.sort((a, b) => a - b)
    const tickP95 = percentile(durations, 95)

    return {
      players,
      mobs,
      tickP50: percentile(durations, 50),
      tickP95,
      tickP99: percentile(durations, 99),
      bytesPerClient,
      heapMb: process.memoryUsage().heapUsed / 1024 / 1024,
      withinBudget: tickP95 < GAME_CONFIG.tickRate,
    }
  } finally {
    // Each point builds a real room with a real Planck world and AI module.
    // Without this the sweep leaks a world per point and the heap figures lie.
    env.dispose()
  }
}

export function runLoadSweep(
  playerCounts = [1, 10, 50, 100, 200, 300],
  mobCounts = [50, 200, 500, 1000]
): CapacityRow[] {
  const rows: CapacityRow[] = []
  for (const players of playerCounts) {
    for (const mobs of mobCounts) {
      const row = runOnePoint(players, mobs)
      rows.push(row)
      const verdict = row.withinBudget ? 'OK  ' : 'OVER'
      console.log(
        `${verdict} players=${String(players).padStart(3)} mobs=${String(mobs).padStart(4)} ` +
          `p50=${row.tickP50.toFixed(1)}ms p95=${row.tickP95.toFixed(1)}ms ` +
          `p99=${row.tickP99.toFixed(1)}ms bytes/client=${row.bytesPerClient} ` +
          `heap=${row.heapMb.toFixed(0)}MB`
      )
    }
  }
  return rows
}

if (require.main === module) {
  console.log(
    `Tick budget: ${GAME_CONFIG.tickRate}ms | AOI radius: ${AOI_CONFIG.radius} | ` +
      `hysteresis: ${AOI_CONFIG.hysteresis}\n`
  )
  runLoadSweep()
}
