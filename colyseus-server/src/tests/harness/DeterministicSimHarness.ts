import { buildTestRoom, addPlayerAt, spawnRealMob, TestEnv, seedRandom } from '../f018-harness'
import { GAME_CONFIG } from '../../config/gameConfig'
import { Mob } from '../../schemas/Mob'
import { Player } from '../../schemas/Player'

export class Mulberry32PRNG {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }
}

export interface EntityTraceSnapshot {
  id: string
  type: 'player' | 'mob'
  x: number
  y: number
  vx: number
  vy: number
  health: number
  isAlive: boolean
  behavior?: string
  targetId?: string | null
}

export interface TickTraceSnapshot {
  tick: number
  simTimeMs: number
  entities: EntityTraceSnapshot[]
}

export interface SimulationTrace {
  seed: number
  totalTicks: number
  tickRateMs: number
  arenaWidth: number
  arenaHeight: number
  snapshots: TickTraceSnapshot[]
  finalSummary: {
    alivePlayers: number
    aliveMobs: number
    totalDamageEvents?: number
  }
}

export function runDeterministicSimulation(
  seed = 0x1337c0de,
  totalTicks = 1000,
  playerCount = 10,
  mobCount = 50
): { trace: SimulationTrace; env: TestEnv } {
  const originalDateNow = Date.now
  const originalPerfNow = performance.now
  const SIM_BASE = 1700000000000

  let currentSimTime = 0
  Date.now = () => SIM_BASE + currentSimTime
  performance.now = () => currentSimTime

  const restoreRandom = seedRandom(seed)
  const prng = new Mulberry32PRNG(seed)
  const env = buildTestRoom(`deterministic-trace-${seed.toString(16)}`)
  const originalDispose = env.dispose
  env.dispose = () => {
    Date.now = originalDateNow
    performance.now = originalPerfNow
    restoreRandom()
    originalDispose()
  }
  const state = env.state

  // Clear existing mobs
  state.clearAllMobs()

  // Track bots
  interface BotAgent {
    id: string
    vx: number
    vy: number
  }
  const bots: BotAgent[] = []
  const margin = 25

  for (let i = 0; i < playerCount; i++) {
    const id = `det-p${i}`
    const x = prng.range(100, state.width - 100)
    const y = prng.range(100, state.height - 100)
    addPlayerAt(env, id, x, y)
    const angle = prng.range(0, Math.PI * 2)
    const bot = { id, vx: Math.cos(angle), vy: Math.sin(angle) }
    bots.push(bot)
    state.updatePlayerInput(id, bot.vx, bot.vy)
  }

  for (let i = 0; i < mobCount; i++) {
    state.tick = i + 1
    const x = prng.range(50, state.width - 50)
    const y = prng.range(50, state.height - 50)
    spawnRealMob(env, x, y)
  }

  const snapshots: TickTraceSnapshot[] = []

  function captureSnapshot(currentTick: number): TickTraceSnapshot {
    const entities: EntityTraceSnapshot[] = []

    for (const player of state.players.values()) {
      entities.push({
        id: player.id,
        type: 'player',
        x: Math.round(player.x * 10000) / 10000,
        y: Math.round(player.y * 10000) / 10000,
        vx: Math.round(player.vx * 10000) / 10000,
        vy: Math.round(player.vy * 10000) / 10000,
        health: Math.round(player.currentHealth * 100) / 100,
        isAlive: player.isAlive,
      })
    }

    for (const mob of state.mobs.values()) {
      const decision = (state.worldInterface as any).aiDecisions?.get(mob.id)
      entities.push({
        id: mob.id,
        type: 'mob',
        x: Math.round(mob.x * 10000) / 10000,
        y: Math.round(mob.y * 10000) / 10000,
        vx: Math.round(mob.vx * 10000) / 10000,
        vy: Math.round(mob.vy * 10000) / 10000,
        health: Math.round(mob.currentHealth * 100) / 100,
        isAlive: mob.isAlive,
        behavior: decision?.behaviorName || 'idle',
        targetId: decision?.targetId || null,
      })
    }

    // Sort entities deterministically by id
    entities.sort((a, b) => a.id.localeCompare(b.id))

    return {
      tick: currentTick,
      simTimeMs: env.room.simClock.now(),
      entities,
    }
  }

  // Record initial state at tick 0
  snapshots.push(captureSnapshot(0))

  for (let t = 1; t <= totalTicks; t++) {
    currentSimTime = t * GAME_CONFIG.tickRate
    // Steer bots
    for (const bot of bots) {
      const player = state.players.get(bot.id)
      if (!player || !player.isAlive) continue

      if (player.x <= margin && bot.vx < 0) bot.vx = -bot.vx
      else if (player.x >= state.width - margin && bot.vx > 0) bot.vx = -bot.vx
      if (player.y <= margin && bot.vy < 0) bot.vy = -bot.vy
      else if (player.y >= state.height - margin && bot.vy > 0) bot.vy = -bot.vy

      // Deterministic wander turn every 50 ticks per bot
      if (t % 50 === 0) {
        const turnAngle = prng.range(-0.5, 0.5)
        const currentAngle = Math.atan2(bot.vy, bot.vx) + turnAngle
        bot.vx = Math.cos(currentAngle)
        bot.vy = Math.sin(currentAngle)
      }

      state.updatePlayerInput(bot.id, bot.vx, bot.vy)
    }

    // Execute authoritative simulation update (fixed 50 ms tick)
    env.sim.update(GAME_CONFIG.tickRate)

    // Capture snapshots every 100 ticks, and every tick in the final 990-1000 window
    if (t % 100 === 0 || t >= 990) {
      snapshots.push(captureSnapshot(t))
    }
  }

  let alivePlayers = 0
  for (const p of state.players.values()) {
    if (p.isAlive) alivePlayers++
  }

  let aliveMobs = 0
  for (const m of state.mobs.values()) {
    if (m.isAlive) aliveMobs++
  }

  const trace: SimulationTrace = {
    seed,
    totalTicks,
    tickRateMs: GAME_CONFIG.tickRate,
    arenaWidth: state.width,
    arenaHeight: state.height,
    snapshots,
    finalSummary: {
      alivePlayers,
      aliveMobs,
    },
  }

  return { trace, env }
}
