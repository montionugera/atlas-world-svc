/**
 * F-018 Phase 5 test harness — the balance model meets the real simulation.
 *
 * Two halves:
 *
 *   1. `loadCombatModel()` reads the CLOSED-FORM model straight out of
 *      `tools/combat-lab/index.html`, exactly the way `tools/combat-lab/verify.mjs`
 *      does (slice the model region between two markers, evaluate it with the
 *      committed `combat-model.json` as DATA). The tests therefore compare against
 *      the live model rather than hand-copied numbers, and they go red the moment
 *      the model's calibration moves.
 *
 *   2. `buildTestRoom()` mirrors `GameRoom.onCreate()` — real GameState, real
 *      Planck physics, real BattleManager/BattleModule/ProjectileManager,
 *      real AIModule, real RoomEventHandler — and `tickRoom()` drives the real
 *      ordered pass in `GameSimulationSystem.update()`. `GameRoom.maxClients` is 1
 *      for single-player debugging, so multi-player tests build the room directly
 *      instead of connecting clients (same approach as
 *      `game-simulation-integration.test.ts`).
 *
 * ── Why swings are converted into queued hits ────────────────────────────────
 *
 * `landEverySwing()` replaces each mob attack strategy's `execute()` with a call
 * that enqueues the hit on the real `BattleManager` queue — the same
 * `createAttackMessage({ attackType: 'projectile', ... })` shape
 * `ProjectileCollisionResolver` builds — instead of spawning a melee projectile
 * that then has to physically connect.
 *
 * This is deliberate and it is a real gap being papered over on purpose, so it is
 * written down rather than hidden: driving the projectile path end to end, a
 * `balanced` mob standing in melee range of a stationary player landed only
 * **5 of 8 swings over 20 s**, and landed **0 of 8** when the player was swinging
 * back (a player in wind-up deflects incoming melee via
 * `DeflectionResolver.checkDeflection`). Hit-landing loss has nothing to do with
 * focus fire or with the damage formula, so leaving it in would turn both
 * questions these tests ask into coin flips. Everything downstream of the swing —
 * queue batching, `BattleModule.processAttack`, `DamageCalculator`, `applyDamage`,
 * `die()`, knockback via `BATTLE_DAMAGE_PRODUCED` — is the real code path.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { GameState } from '../schemas/GameState'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { BattleManager } from '../modules/BattleManager'
import { BattleModule } from '../modules/BattleModule'
import { ProjectileManager } from '../modules/ProjectileManager'
import { ZoneEffectManager } from '../modules/ZoneEffectManager'
import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'
import { GameSimulationSystem } from '../rooms/systems/GameSimulationSystem'
import { RoomEventHandler } from '../rooms/handlers/RoomEventHandler'
import { eventBus } from '../events/EventBus'
import { WorldLife } from '../schemas/WorldLife'
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { GAME_CONFIG } from '../config/gameConfig'

// ───────────────────────────────────────────────────────── the closed form ───

const LAB_ROOT = join(__dirname, '../../../tools/combat-lab')
const MODEL_START = 'const grow = (L)'
const MODEL_END = '// ============================================================= render =='

/** The three magnitudes plus the four split-shape tags, as the model reports them. */
export interface ModelEntity {
  atk: number
  def: number
  hp: number
  cs: number
  rho: number
  pAtk: number
  mAtk: number
  pDef: number
  mDef: number
}

export interface LadderRank {
  rank: string
  shape: 'pack' | 'boss'
  n: number
  r: number
  swings: number
  from?: number
  to?: number
  level?: number
  ttk?: number
}

export interface CombatModel {
  player(L: number, spec: string | Record<string, unknown>): ModelEntity
  mob(L: number, rank: string): ModelEntity
  R(L: number, rank: string, spec: string | Record<string, unknown>, n?: number): number
  ttk(L: number, rank: string, spec: string | Record<string, unknown>): number
  hit(att: ModelEntity, dfn: ModelEntity, Ldef: number): number
  hitsToKill(p: ModelEntity, m: ModelEntity, Lm: number): number
  hitsToDie(p: ModelEntity, m: ModelEntity, L: number): number
  midLevel(rk: LadderRank): number
  mobLevel(L: number): number
  refHp(L: number): number
  rankSustain(rk: LadderRank): number
}

export interface LoadedModel {
  model: CombatModel
  /** Flattened slider values, same bootstrap the page's loadDefaults() does. */
  P: Record<string, number>
  ladder: LadderRank[]
}

/**
 * Evaluate the model region of index.html. Same extraction as verify.mjs:50-152 —
 * if the markers move, that file breaks too, so they cannot drift silently.
 */
export function loadCombatModel(): LoadedModel {
  const html = readFileSync(join(LAB_ROOT, 'index.html'), 'utf8')
  const data = JSON.parse(readFileSync(join(LAB_ROOT, 'combat-model.json'), 'utf8'))

  const P: Record<string, number> = { levelMax: data.proposed.levelMax }
  for (const [k, d] of Object.entries(data.proposed.inputs)) {
    P[k] = (d as { value: number }).value
  }

  const a = html.indexOf(MODEL_START)
  const b = html.indexOf(MODEL_END)
  if (a < 0 || b < 0 || b <= a) {
    throw new Error('f018-harness: could not locate the model region in index.html')
  }

  const model = new Function(
    'DATA',
    'P',
    `${html.slice(a, b)}; return { player, mob, R, ttk, hit, hitsToKill, hitsToDie, midLevel, mobLevel, refHp, rankSustain };`
  )(data, P) as CombatModel

  return { model, P, ladder: data.proposed.ladder as LadderRank[] }
}

// ──────────────────────────────────────────────────────────── the real room ───

export interface TestRoom {
  state: GameState
  roomId: string
  physicsManager: PlanckPhysicsManager
  battleManager: BattleManager
  battleModule: BattleModule
  projectileManager: ProjectileManager
  zoneEffectManager: ZoneEffectManager
  mobLifeCycleManager: MobLifeCycleManager
}

export interface TestEnv {
  room: TestRoom
  state: GameState
  sim: GameSimulationSystem
  physicsManager: PlanckPhysicsManager
  battleManager: BattleManager
  mobLifeCycleManager: MobLifeCycleManager
  dispose(): void
}

/** The tick the server actually runs (50 ms / 20 FPS), not the README's 30 Hz. */
export const TICK_MS = GAME_CONFIG.tickRate

/** Mirrors GameRoom.onCreate()'s wiring, including RoomEventHandler registration. */
export function buildTestRoom(roomId: string, mapId = 'map-test'): TestEnv {
  const state = new GameState(mapId, roomId)

  const physicsManager = new PlanckPhysicsManager(state.width, state.height)
  physicsManager.setRoomId(roomId)

  const battleManager = new BattleManager(roomId, state)
  state.battleManager = battleManager

  const battleModule = new BattleModule(state)
  const projectileManager = new ProjectileManager(state, battleModule, battleManager)
  const zoneEffectManager = new ZoneEffectManager(state, battleModule)

  const mobLifeCycleManager = new MobLifeCycleManager(roomId, state)
  mobLifeCycleManager.setProjectileManager(projectileManager)
  state.mobLifeCycleManager = mobLifeCycleManager

  state.worldInterface.setPhysicsManager(physicsManager)

  const room: TestRoom = {
    state,
    roomId,
    physicsManager,
    battleManager,
    battleModule,
    projectileManager,
    zoneEffectManager,
    mobLifeCycleManager,
  }

  // Silence ambient spawning. MobLifeCycleManager.update() runs every tick from the
  // simulation loop and tops every map spawn area back up to its desired count, so a
  // controlled 4-mob experiment quietly acquires ~20 map mobs (including boss-area
  // ones) inside a minute — measured, and it was corrupting the first version of
  // these tests. Emptying the area list is the smallest intervention that keeps
  // cleanupReadyMobs and spawnMobAt working; a fresh array is assigned rather than
  // spliced because getMobSpawnAreasForMap returns the shared MAP_CONFIG array.
  ;(mobLifeCycleManager as unknown as { spawnAreas: unknown[] }).spawnAreas = []

  const handler = new RoomEventHandler(room as never)
  handler.register()

  const sim = new GameSimulationSystem(room as never)

  return {
    room,
    state,
    sim,
    physicsManager,
    battleManager,
    mobLifeCycleManager,
    dispose() {
      state.stopAI()
      battleManager.cleanup()
      eventBus.removeRoomListeners(roomId)
      physicsManager.destroy()
    },
  }
}

/**
 * One real tick: the ordered pass, then advance the (faked) clock, then drain the
 * microtask queue — `BattleManager.processActionMessages()` is async and the
 * simulation loop does not await it.
 */
export async function tickRoom(env: TestEnv, ms: number = TICK_MS): Promise<void> {
  env.sim.update(ms)
  jest.advanceTimersByTime(ms)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

/** Teleport an entity and move its physics body with it (bodies are authoritative). */
export function placeAt(env: TestEnv, entity: WorldLife, x: number, y: number): void {
  entity.x = x
  entity.y = y
  entity.vx = 0
  entity.vy = 0
  env.physicsManager.syncEntityToBody(entity, entity.id)
}

/** Spawn a real mob (real strategies, real AI registration, real physics body). */
export function spawnRealMob(env: TestEnv, x: number, y: number): Mob {
  const before = new Set(env.state.mobs.keys())
  env.mobLifeCycleManager.spawnMobAt(x, y)
  for (const [id, mob] of env.state.mobs.entries()) {
    if (!before.has(id)) return mob
  }
  throw new Error('f018-harness: spawnMobAt did not create a mob')
}

/**
 * Make every mob swing land, via the real queue. See the file header for why.
 * Returns the swing log so a test can assert it is not vacuous.
 */
export interface Swing {
  attackerId: string
  targetId: string
  damage: number
}

export function landEverySwing(env: TestEnv, mob: Mob): Swing[] {
  const swings: Swing[] = []
  for (const strategy of mob.attackStrategies) {
    // Only `execute` is replaced. `canExecute`/`attemptExecute` still gate the
    // swing on range, facing and cooldown, so WHEN a mob swings and WHO it swings
    // at are still decided by the real strategy + AI.
    strategy.execute = (attacker: WorldLife, target: WorldLife): boolean => {
      if (!target || !target.isAlive) return false
      const damage = attacker.pAtk
      env.battleManager.addActionMessage(
        BattleManager.createAttackMessage({
          actorId: attacker.id,
          targetId: target.id,
          damage,
          range: 2,
          damageType: 'physical',
          element: 'neutral',
          attackType: 'projectile',
        })
      )
      swings.push({ attackerId: attacker.id, targetId: target.id, damage })
      return true
    }
  }
  return swings
}

/**
 * Enqueue one hit on the real BattleManager queue, in exactly the shape
 * `ProjectileCollisionResolver` builds for a connecting projectile — so
 * `attackType: 'projectile'` bypasses the range and cooldown re-checks in
 * `BattleModule.canAttack` (the collision already decided both), and the hit is
 * mitigated and applied by the real `DamageCalculator` / `applyDamage`.
 */
export function enqueueHit(
  env: TestEnv,
  attacker: WorldLife,
  target: WorldLife,
  damage: number,
  damageType: 'physical' | 'magical' = 'physical'
): void {
  env.battleManager.addActionMessage(
    BattleManager.createAttackMessage({
      actorId: attacker.id,
      targetId: target.id,
      damage,
      range: 2,
      damageType,
      element: 'neutral',
      attackType: 'projectile',
    })
  )
}

/**
 * Per-entity incoming damage, measured as health decreases across ticks. Path
 * agnostic on purpose: it counts what the entity actually lost, no matter which
 * code path took it.
 */
export class DamageLedger {
  private last = new Map<string, number>()
  readonly taken = new Map<string, number>()

  constructor(private entities: WorldLife[]) {
    for (const e of entities) {
      this.last.set(e.id, e.currentHealth)
      this.taken.set(e.id, 0)
    }
  }

  sample(): void {
    for (const e of this.entities) {
      const prev = this.last.get(e.id) ?? e.currentHealth
      if (e.currentHealth < prev) {
        this.taken.set(e.id, (this.taken.get(e.id) ?? 0) + (prev - e.currentHealth))
      }
      this.last.set(e.id, e.currentHealth)
    }
  }

  get total(): number {
    let sum = 0
    for (const v of this.taken.values()) sum += v
    return sum
  }

  /** Largest single share of the total, and whose it is. */
  worstShare(): { id: string; share: number } {
    const total = this.total
    let id = ''
    let worst = 0
    for (const [k, v] of this.taken.entries()) {
      const share = total > 0 ? v / total : 0
      if (share > worst) {
        worst = share
        id = k
      }
    }
    return { id, share: worst }
  }

  report(): string {
    const total = this.total
    return [...this.taken.entries()]
      .map(
        ([k, v]) => `${k}=${v.toFixed(0)} (${total > 0 ? ((v / total) * 100).toFixed(1) : '0.0'}%)`
      )
      .join('  ')
  }
}

/**
 * Replace Math.random with a seeded LCG for the duration of a test.
 *
 * WanderBehavior and the mob-id suffix are the only randomness in the loop, but
 * they are enough to make a spread measurement wobble run to run. Physics and the
 * faked clock are already deterministic, so seeding removes the last source of
 * flake and makes a measured share a fixed number rather than a sample.
 */
export function seedRandom(seed = 0x2f6e2b1): () => void {
  let s = seed >>> 0
  const original = Math.random
  Math.random = () => {
    // Numerical Recipes LCG — value only needs to be uniform, not cryptographic.
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 0x100000000
  }
  return () => {
    Math.random = original
  }
}

/** Give a player enough HP that the measurement window cannot kill it. */
export function makeUnkillable(entity: WorldLife, hp = 1e9): void {
  entity.maxHealth = hp
  entity.currentHealth = hp
}

/** Add a player at an explicit position (addPlayer always spawns at map centre). */
export function addPlayerAt(env: TestEnv, id: string, x: number, y: number): Player {
  const player = env.state.addPlayer(id, id)
  placeAt(env, player, x, y)
  return player
}
