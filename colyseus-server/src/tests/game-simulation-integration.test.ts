import { GameState } from '../schemas/GameState'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { BattleManager } from '../modules/BattleManager'
import { BattleModule } from '../modules/BattleModule'
import { ProjectileManager } from '../modules/ProjectileManager'
import { ZoneEffectManager } from '../modules/ZoneEffectManager'
import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'
import { GameSimulationSystem } from '../rooms/systems/GameSimulationSystem'
import { Projectile } from '../schemas/Projectile'

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

  const room = {
    state,
    roomId: ROOM_ID,
    physicsManager,
    battleManager,
    battleModule,
    projectileManager,
    zoneEffectManager,
    mobLifeCycleManager,
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
