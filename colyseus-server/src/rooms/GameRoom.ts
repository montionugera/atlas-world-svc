import { Room, Client } from 'colyseus'
import { GameState } from '../schemas/GameState'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { BattleManager } from '../modules/BattleManager'
import { BattleModule } from '../modules/BattleModule'
import { ProjectileManager } from '../modules/ProjectileManager'
import { ZoneEffectManager } from '../modules/ZoneEffectManager'
import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'
import { registerRoom, unregisterRoom } from '../api'

// Handlers & Systems
import { PlayerInputHandler } from './handlers/PlayerInputHandler'
import { DebugCommandHandler } from './handlers/DebugCommandHandler'
import { RoomEventHandler } from './handlers/RoomEventHandler'
import { GameSimulationSystem } from './systems/GameSimulationSystem'

export interface GameRoomOptions {
  mapId?: string
  name?: string
}

export class GameRoom extends Room<GameState> {
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
    this.projectileManager = new ProjectileManager(this.state, this.battleModule, this.battleManager)
    this.zoneEffectManager = new ZoneEffectManager(this.state, this.battleModule)
    
    this.mobLifeCycleManager = new MobLifeCycleManager(this.roomId, this.state)
    this.mobLifeCycleManager.setProjectileManager(this.projectileManager)
    this.state.mobLifeCycleManager = this.mobLifeCycleManager

    // Connect dependencies
    this.state.worldInterface.setPhysicsManager(this.physicsManager)

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
  }

  onJoin(client: Client, options: GameRoomOptions) {
    console.log(`👤 Player ${client.sessionId} joined the game`)

    // Add player to game state
    const playerName = options.name || `Player-${client.sessionId.substring(0, 8)}`
    const player = this.state.addPlayer(client.sessionId, playerName)

    // Send welcome message
    client.send('welcome', {
      message: `Welcome to ${this.state.mapId}!`,
      playerId: client.sessionId,
      mapId: this.state.mapId,
    })

    // Apply "Entering Game Duty" safe period
    this.battleModule.applyStatusEffect(player, 'entering', 2000)
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`👋 Player ${client.sessionId} left the game`)

    // Physics cleanup is handled by RoomEventHandler via EventBus 'playerLeft'
    this.state.removePlayer(client.sessionId)
    this.state.aiModule.unregisterAgent(client.sessionId)
  }

  onDispose() {
    console.log(`🗑️ GameRoom disposed`)

    unregisterRoom(this.roomId)
    this.state.aiModule.stop()
    this.stopSimulation()
    this.battleManager.cleanup()
    
    // Physics Event listeners managed inside physicsManager are destroyed here
    this.physicsManager.destroy()
  }

  private startSimulation() {
    this.setSimulationInterval((deltaTime) => this.simulationSystem.update(deltaTime))
  }

  private stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval)
      this.simulationInterval = undefined
    }
  }

  enableMobChaseBehavior() {
    this.state.enableMobChaseBehavior()
  }

  enableMobWanderBehavior() {
    this.state.enableMobWanderBehavior()
  }
}
