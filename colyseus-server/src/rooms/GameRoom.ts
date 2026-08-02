import { Room, Client } from 'colyseus'
import { StateView } from '@colyseus/schema'
import { GameState } from '../schemas/GameState'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { BattleManager } from '../modules/BattleManager'
import { BattleModule } from '../modules/BattleModule'
import { ProjectileManager } from '../modules/ProjectileManager'
import { ZoneEffectManager } from '../modules/ZoneEffectManager'
import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'
import { registerRoom, unregisterRoom } from '../api'
import { buildEquipmentSnapshotFromPlayer } from '../config/combat/equipmentSlots'
import { InterestManager, InterestEntity, InterestViewer } from '../interest/InterestManager'
import { createDistancePredicate } from '../interest/visibility'
import {
  collectInterestEntities as collectEntities,
  collectInterestViewers as collectViewers,
} from '../interest/collect'
import { AOI_CONFIG } from '../config/aoiConfig'

// Handlers & Systems
import { PlayerInputHandler } from './handlers/PlayerInputHandler'
import { DebugCommandHandler } from './handlers/DebugCommandHandler'
import { RoomEventHandler } from './handlers/RoomEventHandler'
import { GameSimulationSystem } from './systems/GameSimulationSystem'

// Meta systems (Nakama-backed profile/loadout/match-event reporting)
import { IMetaBackend } from '../meta/IMetaBackend'
import { NakamaMetaBackend } from '../meta/NakamaMetaBackend'
import { MetaEventReporter } from '../meta/MetaEventReporter'
import { loadPlayerLoadout } from '../meta/applyLoadout'
import { GAME_CONFIG } from '../config/gameConfig'

export interface GameRoomOptions {
  mapId?: string
  name?: string
  /** Nakama session token, verified server-side in onAuth to resolve the real userId. */
  token?: string
  /**
   * Dev-only escape hatch for the React debug client: joins as `client.sessionId`
   * without a verified token. Only honored when `NODE_ENV !== 'production'`.
   */
  devBypass?: boolean
}

/**
 * Auth data resolved by `onAuth`. In Colyseus 0.17 the value returned by
 * `onAuth` is auto-attached to `client.auth` (typed via the Client generic),
 * which is what `onJoin` reads for the server-verified identity.
 */
export interface GameRoomAuthData {
  userId: string
}

/**
 * Client type for this room. In 0.17 the auth-data type flows via the single
 * `Client<{ auth }>` generic (the 0.16 `Client<UserData, AuthData>` 2-arg form
 * is gone), and threading it through the Room generic's `client` field makes
 * `client.auth` typed as `GameRoomAuthData` in every lifecycle method.
 */
type GameRoomClient = Client<{ auth: GameRoomAuthData }>

export class GameRoom extends Room<{ state: GameState; client: GameRoomClient }> {
  // Room configuration
  maxClients = 1

  // Simulation settings
  private simulationInterval?: NodeJS.Timeout

  // Core Systems
  public physicsManager!: PlanckPhysicsManager
  public battleManager!: BattleManager
  public battleModule!: BattleModule
  public projectileManager!: ProjectileManager
  public mobLifeCycleManager!: MobLifeCycleManager
  public zoneEffectManager!: ZoneEffectManager
  public interestManager!: InterestManager

  // Meta systems (Nakama-backed; see IMetaBackend)
  public metaBackend!: IMetaBackend
  public metaEventReporter!: MetaEventReporter

  // Extracted Handlers
  private playerInputHandler!: PlayerInputHandler
  private debugCommandHandler!: DebugCommandHandler
  private roomEventHandler!: RoomEventHandler
  private simulationSystem!: GameSimulationSystem

  onCreate(options: GameRoomOptions) {
    console.log(`🎮 GameRoom created with mapId: ${options.mapId || 'map-01-sector-a'}`)

    // Register room for REST API access
    registerRoom(this)

    // Initialize GameState
    const gameState = new GameState(options.mapId || 'map-01-sector-a', this.roomId)
    this.setState(gameState)

    // Initialize Core Managers (physics uses map dimensions from state)
    this.physicsManager = new PlanckPhysicsManager(this.state.width, this.state.height)
    this.physicsManager.setRoomId(this.roomId)

    this.battleManager = new BattleManager(this.roomId, this.state)
    this.state.battleManager = this.battleManager

    this.battleModule = new BattleModule(this.state)
    this.projectileManager = new ProjectileManager(
      this.state,
      this.battleModule,
      this.battleManager
    )
    this.zoneEffectManager = new ZoneEffectManager(this.state, this.battleModule)

    this.mobLifeCycleManager = new MobLifeCycleManager(this.roomId, this.state)
    this.mobLifeCycleManager.setProjectileManager(this.projectileManager)
    this.state.mobLifeCycleManager = this.mobLifeCycleManager

    // Connect dependencies
    this.state.worldInterface.setPhysicsManager(this.physicsManager)

    // Meta systems: report match events (e.g. MOB_KILLED) to Nakama for
    // profile/quest progress. Env-configurable, defaults match local dev.
    this.metaBackend = new NakamaMetaBackend({
      baseUrl: process.env.NAKAMA_HTTP_URL || 'http://localhost:7350',
      httpKey: process.env.NAKAMA_HTTP_KEY || 'atlas_dev_http_key',
    })
    this.metaEventReporter = new MetaEventReporter({
      backend: this.metaBackend,
      matchId: this.roomId,
    })

    this.interestManager = new InterestManager({
      predicate: createDistancePredicate({
        radius: AOI_CONFIG.radius,
        hysteresis: AOI_CONFIG.hysteresis,
      }),
      cellSize: AOI_CONFIG.cellSize,
      candidateRadius: AOI_CONFIG.radius * AOI_CONFIG.hysteresis,
    })

    // Initialize Extracted Handlers & Systems
    this.playerInputHandler = new PlayerInputHandler(this)
    this.debugCommandHandler = new DebugCommandHandler(this)
    this.roomEventHandler = new RoomEventHandler(this)
    this.simulationSystem = new GameSimulationSystem(this)

    // Register Handlers
    this.playerInputHandler.register()
    this.debugCommandHandler.register()
    this.roomEventHandler.register()

    // Start AI & Mobs logic
    this.state.aiModule.start()
    this.state.reInitializeMobs()
    this.state.seedDemoNPCs()

    // Start simulation loop
    this.setPatchRate(50)
    this.startSimulation()
    this.metaEventReporter.start()
  }

  /**
   * Verifies the caller's identity before the seat reservation is consumed.
   * On success, the returned auth data is auto-attached by Colyseus to
   * `client.auth`, which `onJoin` reads — never trust `options.userId` from
   * the client. Rejects (throws) when neither a valid Nakama session token nor
   * the non-production dev bypass is present (fail-closed).
   */
  async onAuth(client: GameRoomClient, options: GameRoomOptions): Promise<GameRoomAuthData> {
    if (options.token) {
      const verified = await this.metaBackend.verifySession(options.token)
      if (verified) return verified
    }

    if (process.env.NODE_ENV !== 'production' && options.devBypass === true) {
      console.warn('[meta] dev bypass join', client.sessionId)
      return { userId: client.sessionId }
    }

    throw new Error('unauthorized: missing or invalid Nakama session token')
  }

  async onJoin(client: GameRoomClient, options: GameRoomOptions) {
    console.log(`👤 Player ${client.sessionId} joined the game`)

    // Server-verified identity from onAuth (auto-attached to client.auth in
    // 0.17) — never trust client-supplied ids. The onJoin 3rd `auth` param is
    // deprecated in 0.17; read client.auth instead. onAuth is fail-closed, so
    // this is guaranteed set here; guard anyway so a missing identity fails the
    // join (fail-closed) rather than seating a player with userId=undefined.
    const userId = client.auth?.userId
    if (!userId) {
      throw new Error('unauthorized: missing verified identity in onJoin')
    }

    // Add player to game state
    const playerName = options.name || `Player-${client.sessionId.substring(0, 8)}`
    const player = this.state.addPlayer(client.sessionId, playerName)
    player.userId = userId

    // With @view() on the root collections a client receives NOTHING until it
    // has a view, so every seated client must get one here.
    client.view = new StateView()
    this.interestManager.attach(client.sessionId, client.view, client.sessionId)

    // Fetch & apply the player's loadout snapshot (profile-derived combat stats).
    // Falls back to ephemeral defaults if the meta backend is unavailable.
    await loadPlayerLoadout({ player, backend: this.metaBackend, userId })

    // Send welcome message (Policy A: include equipment snapshot for HUD)
    client.send('welcome', {
      message: `Welcome to ${this.state.mapId}!`,
      playerId: client.sessionId,
      mapId: this.state.mapId,
      equipment: buildEquipmentSnapshotFromPlayer(player),
    })

    // Apply "Entering Game Duty" safe period
    this.battleModule.applyStatusEffect(player, 'entering', 2000)
  }

  onLeave(client: GameRoomClient, code?: number) {
    console.log(`👋 Player ${client.sessionId} left the game`)

    // Physics cleanup is handled by RoomEventHandler via EventBus 'playerLeft'
    this.interestManager.detach(client.sessionId)
    this.state.removePlayer(client.sessionId)
    this.state.aiModule.unregisterAgent(client.sessionId)
  }

  async onDispose() {
    console.log(`🗑️ GameRoom disposed`)

    unregisterRoom(this.roomId)
    this.state.aiModule.stop()
    this.stopSimulation()
    this.battleManager.cleanup()

    // Stop scheduling further flushes, then drain whatever is still buffered
    // so match events aren't lost on room teardown. flush() itself already
    // waits out any in-flight periodic flush and re-flushes anything
    // recorded since (see MetaEventReporter.flush) — wrap it in try/finally
    // so physics cleanup below always runs even if the final flush rejects.
    this.metaEventReporter.stop()
    try {
      await this.metaEventReporter.flush()
    } finally {
      // Physics Event listeners managed inside physicsManager are destroyed here
      this.physicsManager.destroy()
    }
  }

  private startSimulation() {
    // Fixed-timestep sim at the configured tick interval.
    //
    // The interval must be passed explicitly: without it Colyseus falls back to its
    // ~16.6 ms default, silently running the sim at 3× the designed 20 Hz — the tick
    // counter then beats against the 50 ms patch timer (client-visible timing wobble)
    // and per-tick updates receive tickRate=50 ms while being called every ~17 ms.
    //
    // The delta is FIXED (not the timer's real elapsed time): timer jitter (±3 ms)
    // otherwise leaks into every integration step, making per-tick positions unevenly
    // spaced — which no client-side interpolation can fully smooth. Fixed timestep is
    // also what the entity updates already assume (mob.update(GAME_CONFIG.tickRate)).
    this.setSimulationInterval(
      () => this.simulationSystem.update(GAME_CONFIG.tickRate),
      GAME_CONFIG.tickRate
    )
  }

  private stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval)
      this.simulationInterval = undefined
    }
  }

  /**
   * Flattens the five view-filtered root collections into the shape
   * InterestManager consumes. Keyed by session id for players so it matches
   * interestManager.attach().
   */
  collectInterestEntities(): InterestEntity[] {
    return collectEntities(this.state)
  }

  collectInterestViewers(): InterestViewer[] {
    return collectViewers(this.state)
  }

  enableMobChaseBehavior() {
    this.state.enableMobChaseBehavior()
  }

  enableMobWanderBehavior() {
    this.state.enableMobWanderBehavior()
  }
}
