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
 * ── Real-time pacing (measurement-validity fix, 2026-08-02) ────────────────
 *
 * The tick loop is paced to real wall-clock time (~GAME_CONFIG.tickRate ms
 * apart), sleeping only the leftover time after each tick's work completes.
 * This was NOT cosmetic: it compensates for systems that gate their per-tick
 * work on wall-clock `Date.now()`, which an unpaced loop (a few ms per
 * iteration) starves almost completely.
 *
 * `AIModule` was the case this harness originally exposed — measured at 6 of
 * 100 ticks actually running AI decision logic in an earlier, unpaced version,
 * which invalidated the first capacity table published from it. As of F-028 it
 * no longer needs the pacing: it gates on the room's SimClock (simulated time),
 * so it runs once per tick at any execution speed.
 *
 * The pacing stays because other systems still gate on `Date.now()` — respawn,
 * projectile lifetimes, combat scheduling — and pacing is what keeps them
 * behaving as they do in production. Converting those is F-028's step 3,
 * deliberately out of scope both there and here.
 *
 * Run: npm run load
 */
import { performance } from 'perf_hooks'
import { Encoder, StateView } from '@colyseus/schema'
import { buildTestRoom, addPlayerAt, spawnRealMob } from '../f018-harness'
import { InterestManager } from '../../interest/InterestManager'
import { createDistancePredicate } from '../../interest/visibility'
import { collectInterestEntities as collect } from '../../interest/collect'
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

// collect() now delegates to the shared collectInterestEntities() from
// interest/collect.ts (the same collector GameRoom uses), which also covers
// zoneEffects — the local copy this replaced omitted them. This harness only
// ever spawns players and mobs (addPlayerAt / spawnRealMob); nothing in this
// file calls ZoneEffectManager.createZoneEffect (that only happens via
// PlayerInputHandler/DebugCommandHandler message handlers, which this
// in-process harness never routes through), so zero zone effects exist during
// any sweep and the already-published capacity table's bytesPerClient figures
// are unaffected by this switch.

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Discarded before recording — lets JIT warm up and gives the paced loop a
 * few real ticks to settle before duration/AI-gate behaviour is trusted. */
const WARMUP_TICKS = 20

/** >=200 so p99 (`floor(0.99 * n)`) is not literally the sample maximum, i.e.
 * a single GC blip, the way it was at ticks=100. */
const RECORDED_TICKS = 200

/** A synthetic player that wanders instead of standing idle, so per-player
 * cost (movement, AOI churn, aggro pathing, deflection checks) is actually
 * exercised — idle bots were one of the reviewed harness's confounds. */
interface Bot {
  sessionId: string
  vx: number
  vy: number
}

function makeBot(sessionId: string): Bot {
  const angle = Math.random() * Math.PI * 2
  return { sessionId, vx: Math.cos(angle), vy: Math.sin(angle) }
}

/** Reflects the bot's heading off the world bounds and resubmits it through
 * the real input path (`state.updatePlayerInput`, the same call
 * `PlayerInputHandler.handleMove` makes) — not a raw `player.vx` write. */
function stepBot(state: GameState, bot: Bot, margin: number): void {
  const player = state.players.get(bot.sessionId)
  if (!player) return
  if (player.x <= margin && bot.vx < 0) bot.vx = -bot.vx
  else if (player.x >= state.width - margin && bot.vx > 0) bot.vx = -bot.vx
  if (player.y <= margin && bot.vy < 0) bot.vy = -bot.vy
  else if (player.y >= state.height - margin && bot.vy > 0) bot.vy = -bot.vy
  state.updatePlayerInput(bot.sessionId, bot.vx, bot.vy)
}

export async function runOnePoint(
  players: number,
  mobs: number,
  recordedTicks = RECORDED_TICKS,
  warmupTicks = WARMUP_TICKS
): Promise<CapacityRow> {
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
    const bots: Bot[] = []
    const margin = 20 // world units; maxLinearSpeed=20/s * 0.05s tick << margin, no tunnelling
    for (let i = 0; i < players; i++) {
      const sessionId = `load-s${i}`
      addPlayerAt(env, sessionId, Math.random() * env.state.width, Math.random() * env.state.height)
      const view = new StateView()
      views.push(view)
      im.attach(sessionId, view, sessionId)

      const bot = makeBot(sessionId)
      bots.push(bot)
      env.state.updatePlayerInput(sessionId, bot.vx, bot.vy)
    }

    // Advance tick per spawn — see the file header on the mob-id collision trap.
    for (let i = 0; i < mobs; i++) {
      env.state.tick = i + 1
      spawnRealMob(env, Math.random() * env.state.width, Math.random() * env.state.height)
    }

    const durations: number[] = []
    const totalTicks = warmupTicks + recordedTicks
    let nextTickAt = performance.now()

    for (let t = 0; t < totalTicks; t++) {
      const workStart = performance.now()

      for (const bot of bots) stepBot(env.state, bot, margin)

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

      const workEnd = performance.now()
      // Only simulation work is timed here — the pacing sleep below is
      // deliberately excluded so `durations` measures per-tick cost, not the
      // real-time wait this loop otherwise spends idle.
      if (t >= warmupTicks) durations.push(workEnd - workStart)

      // Pace to real time (see file header: this is what makes AIModule's
      // Date.now() gate, and any other wall-clock-gated system, behave as it
      // does in production). Fixed-increment schedule, not "now + tickRate",
      // so a slow tick doesn't permanently push the schedule later than one
      // tick's worth. If work already overran the budget, skip the sleep
      // entirely rather than waiting a full tick on top of the overrun.
      nextTickAt += GAME_CONFIG.tickRate
      const sleepMs = nextTickAt - performance.now()
      if (sleepMs > 0) await sleep(sleepMs)
    }

    // Snapshot bytes: encodeAll() first to establish the untagged-field offset
    // (all five root collections carry @view(), so encodeAll() alone only sees
    // ~37 bytes of scalars — it is NOT the per-client figure), then encode a
    // sample of clients' actual filtered StateViews via encodeAllView() and
    // average them. A single sampled client was visibly noisy run to run;
    // averaging up to 10 spread across the roster smooths session-specific
    // AOI membership variance. Same encodeAll/encodeAllView pairing as the
    // Task 5 bandwidth test (bandwidth.test.ts).
    const encoder = new Encoder(env.state)
    const shared = encoder.encodeAll()
    let bytesPerClient = 0
    if (views.length > 0) {
      const sampleCount = Math.min(views.length, 10)
      const stride = Math.max(1, Math.floor(views.length / sampleCount))
      let total = 0
      let sampled = 0
      for (let i = 0; i < views.length && sampled < sampleCount; i += stride) {
        total += encoder.encodeAllView(views[i], shared.byteLength, { offset: 0 }).byteLength
        sampled++
      }
      bytesPerClient = total / sampled
    }

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

export async function runLoadSweep(
  playerCounts = [1, 10, 50, 100, 200, 300],
  mobCounts = [50, 200, 500, 1000]
): Promise<CapacityRow[]> {
  const rows: CapacityRow[] = []
  for (const players of playerCounts) {
    for (const mobs of mobCounts) {
      const row = await runOnePoint(players, mobs)
      rows.push(row)
      const verdict = row.withinBudget ? 'OK  ' : 'OVER'
      console.log(
        `${verdict} players=${String(players).padStart(3)} mobs=${String(mobs).padStart(4)} ` +
          `p50=${row.tickP50.toFixed(1)}ms p95=${row.tickP95.toFixed(1)}ms ` +
          `p99=${row.tickP99.toFixed(1)}ms bytes/client=${row.bytesPerClient.toFixed(0)} ` +
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
  runLoadSweep().catch(err => {
    console.error(err)
    process.exitCode = 1
  })
}
