import { GameState } from '../schemas/GameState'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { BattleManager } from '../modules/BattleManager'
import { BattleModule } from '../modules/BattleModule'
import { ProjectileManager } from '../modules/ProjectileManager'
import { ZoneEffectManager } from '../modules/ZoneEffectManager'
import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'
import { GameSimulationSystem } from '../rooms/systems/GameSimulationSystem'
import { Projectile } from '../schemas/Projectile'
import { Mob } from '../schemas/Mob'
import { RoomEventHandler } from '../rooms/handlers/RoomEventHandler'
import { eventBus } from '../events/EventBus'
import { FakeMetaBackend } from '../meta/FakeMetaBackend'
import { MetaEventReporter } from '../meta/MetaEventReporter'
import { InterestManager, InterestEntity, InterestViewer } from '../interest/InterestManager'
import { createDistancePredicate } from '../interest/visibility'
import { AOI_CONFIG } from '../config/aoiConfig'

/**
 * Integration test for the per-tick simulation loop (GameSimulationSystem) wired
 * to the REAL managers — physics, projectiles, battle, mob-lifecycle and zone.
 * This is the closest thing to an end-to-end exercise of the request->simulation
 * layer without booting a Colyseus server: it mirrors GameRoom.onCreate's wiring
 * and drives full ticks. Covers GameSimulationSystem (previously 0%) and the
 * cross-manager integration that unit tests can't reach.
 */
const ROOM_ID = 'room-itest'

// Mirrors GameRoom.onCreate() — builds a real GameState + all managers and a
// duck-typed `room` for GameSimulationSystem (which only reads these fields).
function buildRoom() {
  const state = new GameState('map-test', ROOM_ID)

  const physicsManager = new PlanckPhysicsManager(state.width, state.height)
  physicsManager.setRoomId(ROOM_ID)

  const battleManager = new BattleManager(ROOM_ID, state)
  state.battleManager = battleManager

  const battleModule = new BattleModule(state)
  const projectileManager = new ProjectileManager(state, battleModule, battleManager)
  const zoneEffectManager = new ZoneEffectManager(state, battleModule)

  const mobLifeCycleManager = new MobLifeCycleManager(ROOM_ID, state)
  mobLifeCycleManager.setProjectileManager(projectileManager)
  state.mobLifeCycleManager = mobLifeCycleManager

  state.worldInterface.setPhysicsManager(physicsManager)

  // Same construction as GameRoom.onCreate() — a harness that diverges from the
  // room's options is a future bug, not a simplification.
  const interestManager = new InterestManager({
    predicate: createDistancePredicate({
      radius: AOI_CONFIG.radius,
      hysteresis: AOI_CONFIG.hysteresis,
    }),
    cellSize: AOI_CONFIG.cellSize,
    candidateRadius: AOI_CONFIG.radius * AOI_CONFIG.hysteresis,
  })

  const room = {
    state,
    roomId: ROOM_ID,
    physicsManager,
    battleManager,
    battleModule,
    projectileManager,
    zoneEffectManager,
    mobLifeCycleManager,
    interestManager,
    // Mirrors GameRoom.collectInterestEntities()/collectInterestViewers().
    collectInterestEntities(): InterestEntity[] {
      const out: InterestEntity[] = []
      for (const [sessionId, p] of state.players.entries()) {
        out.push({ id: sessionId, x: p.x, y: p.y, ref: p })
      }
      for (const m of state.mobs.values()) out.push({ id: m.id, x: m.x, y: m.y, ref: m })
      for (const n of state.npcs.values()) out.push({ id: n.id, x: n.x, y: n.y, ref: n })
      for (const pr of state.projectiles.values()) {
        out.push({ id: pr.id, x: pr.x, y: pr.y, ref: pr })
      }
      for (const z of state.zoneEffects.values()) {
        out.push({ id: z.id, x: z.x, y: z.y, ref: z })
      }
      return out
    },
    collectInterestViewers(): InterestViewer[] {
      const out: InterestViewer[] = []
      for (const [sessionId, p] of state.players.entries()) {
        out.push({ sessionId, x: p.x, y: p.y })
      }
      return out
    },
  }

  const sim = new GameSimulationSystem(room as any)
  return { room, state, physicsManager, projectileManager, sim }
}

describe('GameSimulationSystem (integration)', () => {
  let env: ReturnType<typeof buildRoom>

  beforeEach(() => {
    env = buildRoom()
    env.state.reInitializeMobs() // seed mobs from map config
    env.state.addPlayer('p1', 'Player One')
  })

  afterEach(() => {
    env.state.stopAI()
    if (typeof (env.physicsManager as any).destroy === 'function') {
      ;(env.physicsManager as any).destroy()
    }
  })

  it('advances the tick counter once per update()', () => {
    expect(env.state.tick).toBe(0)
    env.sim.update(50)
    env.sim.update(50)
    env.sim.update(50)
    // updateMobs() (inside the loop) increments tick; reaching it means the loop
    // ran past physics/projectile/player stages without a thrown+caught error.
    expect(env.state.tick).toBe(3)
  })

  it('runs full ticks with players, mobs and a projectile without a swallowed simulation error', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const proj = new Projectile('proj-live', 100, 100, 0, 0, 'p1', 5)
    proj.maxRange = 1000 // far from despawning
    env.state.projectiles.set(proj.id, proj)

    for (let i = 0; i < 5; i++) env.sim.update(50)

    // GameSimulationSystem.update() catches errors and logs "SIMULATION ERROR".
    const simErrors = errSpy.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].includes('SIMULATION ERROR')
    )
    expect(simErrors).toHaveLength(0)
    expect(env.state.tick).toBe(5)

    errSpy.mockRestore()
  })

  it('creates a physics body for a newly added projectile (updatePhysicsBodies)', () => {
    const proj = new Projectile('proj-body', 50, 50, 10, 0, 'p1', 5)
    proj.maxRange = 1000
    env.state.projectiles.set(proj.id, proj)

    expect(env.physicsManager.getBody(proj.id)).toBeFalsy()
    env.sim.update(50)
    expect(env.physicsManager.getBody(proj.id)).toBeTruthy()
    expect(env.state.projectiles.has(proj.id)).toBe(true)
  })

  it('despawns an out-of-range projectile and removes its physics body in one tick', () => {
    const proj = new Projectile('proj-dead', 200, 200, 0, 0, 'p1', 5)
    proj.maxRange = 0 // distanceTraveled (0) >= maxRange (0) -> shouldDespawn()
    env.state.projectiles.set(proj.id, proj)

    env.sim.update(50)

    expect(env.state.projectiles.has(proj.id)).toBe(false)
    expect(env.physicsManager.getBody(proj.id)).toBeFalsy()
  })

  it('keeps player input flowing through a tick without dropping the player', () => {
    env.state.updatePlayerInput('p1', 1, 0)
    env.sim.update(50)
    const player = env.state.getPlayer('p1')
    expect(player).toBeDefined()
    expect(player!.isAlive).toBe(true)
    expect(Number.isFinite(player!.x)).toBe(true)
    expect(Number.isFinite(player!.y)).toBe(true)
  })
})

/**
 * Meta event flow (B4): a player killing a mob over real simulation ticks must
 * reach the meta backend as a MOB_KILLED match event, and a dispose-time flush
 * (mirrors GameRoom.onDispose: stop() then flush()) must drain the buffer.
 */
describe('GameSimulationSystem (integration): meta event flow', () => {
  afterEach(() => {
    // RoomEventHandler registers on the shared eventBus singleton keyed by
    // ROOM_ID; clear listeners between tests so they don't pile up.
    eventBus.removeRoomListeners(ROOM_ID)
  })

  it('reports MOB_KILLED with seq 0 when a player kills a mob, and a dispose-flush drains the buffer', async () => {
    const env = buildRoom()
    env.state.addPlayer('p1', 'Player One')
    const player = env.state.getPlayer('p1')!
    // Mirrors GameRoom.onJoin: userId is set from verified auth, not sessionId.
    player.userId = 'p1'

    const mob = new Mob({ id: 'mob-test', x: player.x, y: player.y, radius: 1 })
    mob.mobTypeId = 'goblin'
    env.state.mobs.set(mob.id, mob)

    const backend = new FakeMetaBackend()
    const metaEventReporter = new MetaEventReporter({ backend, matchId: ROOM_ID })
    ;(env.room as unknown as { metaEventReporter: MetaEventReporter }).metaEventReporter =
      metaEventReporter

    const roomEventHandler = new RoomEventHandler(env.room as any)
    roomEventHandler.register()

    // Lethal hit — BattleModule.applyDamage() calls target.die() before
    // BATTLE_DAMAGE_PRODUCED is emitted, so RoomEventHandler sees the kill.
    const attackEvent = env.room.battleModule.processAttack(player, mob, {
      damage: 9999,
      damageType: 'physical',
      element: 'neutral',
      range: 10,
    })
    expect(attackEvent?.targetDied).toBe(true)
    expect(mob.isAlive).toBe(false)

    // Drive real ticks after the kill, as in a live match.
    for (let i = 0; i < 3; i++) env.sim.update(50)

    await metaEventReporter.flush()

    expect(backend.batches).toHaveLength(1)
    expect(backend.batches[0].seq).toBe(0)
    expect(backend.batches[0].events).toContainEqual({
      type: 'MOB_KILLED',
      userId: 'p1',
      targetId: 'goblin',
      count: 1,
    })

    // Simulate more activity buffered right up to room teardown, then the
    // dispose-time stop()+flush() sequence — the buffer must drain.
    metaEventReporter.record({ type: 'MOB_KILLED', userId: 'p1', targetId: 'goblin', count: 1 })
    metaEventReporter.stop()
    await metaEventReporter.flush()

    expect(backend.batches).toHaveLength(2)
    expect(backend.batches[1].seq).toBe(1)

    env.state.stopAI()
    env.physicsManager.destroy()
  })
})
