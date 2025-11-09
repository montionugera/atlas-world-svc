import { Room, Client } from 'colyseus'
import { GameState } from '../schemas/GameState'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { Projectile } from '../schemas/Projectile'
import { GAME_CONFIG } from '../config/gameConfig'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { BattleManager } from '../modules/BattleManager'
import { BattleModule } from '../modules/BattleModule'
import { ProjectileManager } from '../modules/ProjectileManager'
import { eventBus, RoomEventType } from '../events/EventBus'
import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'

export interface GameRoomOptions {
  mapId?: string
  name?: string
}

export class GameRoom extends Room<GameState> {
  // Room configuration
  maxClients = 1

  // Simulation settings
  private simulationInterval?: NodeJS.Timeout

  // Physics engine
  private physicsManager!: PlanckPhysicsManager

  // Battle manager for this room
  private battleManager!: BattleManager
  private battleModule!: BattleModule
  private projectileManager!: ProjectileManager
  private mobLifeCycleManager!: MobLifeCycleManager

  onCreate(options: GameRoomOptions) {
    console.log(`🎮 GameRoom created with mapId: ${options.mapId || 'map-01-sector-a'}`)

    // Initialize physics manager
    this.physicsManager = new PlanckPhysicsManager()

    // Set room ID for physics manager to enable event listening
    this.physicsManager.setRoomId(this.roomId)

    // Initialize game state with room ID
    var gameState = new GameState(options.mapId || 'map-01-sector-a', this.roomId)
    this.setState(gameState)

    // Initialize battle manager with game state
    this.battleManager = new BattleManager(this.roomId, this.state)

    // Set battle manager reference for GameState
    this.state.battleManager = this.battleManager

    // Initialize battle module (used by ProjectileManager)
    this.battleModule = new BattleModule(this.state)

    // Initialize projectile manager
    this.projectileManager = new ProjectileManager(this.state, this.battleModule)

    // Initialize mob lifecycle manager
    this.mobLifeCycleManager = new MobLifeCycleManager(this.roomId, this.state)
    // Set projectile manager for mob lifecycle manager
    this.mobLifeCycleManager.setProjectileManager(this.projectileManager)
    // Set lifecycle manager reference for GameState
    this.state.mobLifeCycleManager = this.mobLifeCycleManager

    // Connect physics manager to AI interface
    this.state.worldInterface.setPhysicsManager(this.physicsManager)

    // Start AI module (tick-driven)
    this.state.aiModule.start()

    // Set up event listeners for entity lifecycle events
    this.setupEventListeners()

    // Seed initial mobs via lifecycle manager (reInitializeMobs delegates to it)
    this.state.reInitializeMobs()

    // Collision callbacks are now set up in PlanckPhysicsManager constructor
    // Start simulation loop
    this.startSimulation()

    // Handle player movement input → apply force to physics body (authoritative physics)
    this.onMessage('player_input_move', (client: Client, data: { vx: number; vy: number }) => {
      const player = this.state.getPlayer(client.sessionId)
      if (!player) return
      const { vx, vy } = data || { vx: 0, vy: 0 }
      this.state.updatePlayerInput(client.sessionId, vx, vy)
    })

    // REMOVED: player_position handler - SECURITY VULNERABILITY!
    // Direct position setting allows teleportation hacks
    // Players should only use player_input_move for movement

    // Handle player action input
    this.onMessage(
      'player_input_action',
      (client: Client, data: { action: string; pressed: boolean }) => {
        const player = this.state.getPlayer(client.sessionId)
        if (!player) return
        const { action, pressed } = data || { action: '', pressed: false }
        this.state.updatePlayerAction(client.sessionId, action, pressed)
      }
    )
  }

  /**
   * Set up event listeners for entity lifecycle events
   */
  private setupEventListeners(): void {
    // Player events
    eventBus.onRoomEventPlayerJoin(this.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Player joined ${data.player.sessionId}`)
      this.handlePlayerJoined(data.player)
    })

    eventBus.onRoomEventPlayerLeft(this.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Player left ${data.player.sessionId}`)
      this.handlePlayerLeft(data.player)
    })

    // Mob events
    eventBus.onRoomEventMobSpawn(this.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Mob spawned ${data.mob.id}`)
      this.handleMobSpawned(data.mob)
    })

    eventBus.onRoomEventMobRemove(this.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Mob removed ${data.mob.id}`)
      this.handleMobRemoved(data.mob)
    })

    // Set up projectile collision callbacks
    this.physicsManager.onCollision('projectile', 'player', (bodyA, bodyB) => {
      const projectileData = this.physicsManager.getEntityDataFromBody(bodyA)
      const playerData = this.physicsManager.getEntityDataFromBody(bodyB)
      if (projectileData && playerData) {
        const projectile = this.state.projectiles.get(projectileData.id)
        const player = this.state.players.get(playerData.id)
        if (projectile && player) {
          this.projectileManager.handlePlayerCollision(projectile, player)
        }
      }
    })

    this.physicsManager.onCollision('projectile', 'boundary', (bodyA, bodyB) => {
      const projectileData = this.physicsManager.getEntityDataFromBody(bodyA)
      if (projectileData) {
        const projectile = this.state.projectiles.get(projectileData.id)
        if (projectile) {
          this.projectileManager.handleBoundaryCollision(projectile)
        }
      }
    })
  }

  /**
   * Handle player joined event - setup physics
   */
  private handlePlayerJoined(player: Player): void {
    console.log(`👤 PLAYER JOINED: ${player.sessionId} - Setting up physics`)
    this.physicsManager.createPlayerBody(player)
    console.log(`✅ PLAYER SETUP COMPLETE: ${player.sessionId}`)
  }

  /**
   * Handle player left event - cleanup physics
   */
  private handlePlayerLeft(player: Player): void {
    console.log(`👤 PLAYER LEFT: ${player.sessionId} - Cleaning up physics`)
    this.physicsManager.removeBody(player.id)
    console.log(`✅ PLAYER CLEANUP COMPLETE: ${player.sessionId}`)
  }

  /**
   * Handle mob spawned event - setup physics
   */
  private handleMobSpawned(mob: Mob): void {
    console.log(`👹 MOB SPAWNED: ${mob.id} - Setting up physics`)
    this.physicsManager.createMobBody(mob)
    console.log(`✅ MOB SETUP COMPLETE: ${mob.id}`)
  }

  /**
   * Handle mob removed event - cleanup physics
   */
  private handleMobRemoved(mob: Mob): void {
    console.log(`👹 MOB REMOVED: ${mob.id} - Cleaning up physics`)
    this.physicsManager.removeBody(mob.id)
    console.log(`✅ MOB CLEANUP COMPLETE: ${mob.id}`)
  }

  onJoin(client: Client, options: GameRoomOptions) {
    console.log(`👤 Player ${client.sessionId} joined the game`)

    // Add player to game state
    const playerName = options.name || `Player-${client.sessionId.substring(0, 8)}`
    const player = this.state.addPlayer(client.sessionId, playerName)

    // Physics body creation is now handled by event handlers
    // The addPlayer method will emit a PLAYER_JOINED event

    // Send welcome message
    client.send('welcome', {
      message: `Welcome to ${this.state.mapId}!`,
      playerId: client.sessionId,
      mapId: this.state.mapId,
    })
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`👋 Player ${client.sessionId} left the game`)

    // Remove physics body for player
    this.physicsManager.removeBody(client.sessionId)

    // Remove player from game state
    this.state.removePlayer(client.sessionId)
  }

  onDispose() {
    console.log(`🗑️ GameRoom disposed`)

    // Stop AI module
    this.state.aiModule.stop()

    // Stop simulation
    this.stopSimulation()

    // Clean up BattleManager event listeners
    this.battleManager.cleanup()

    // Clean up EventBus listeners for this room
    eventBus.removeRoomListeners(this.roomId)

    // Clean up physics manager
    this.physicsManager.destroy()
  }

  // Start the game simulation loop
  private startSimulation() {
    this.simulationInterval = setInterval(() => {
      try {
        // Create physics bodies for new projectiles
        for (const projectile of this.state.projectiles.values()) {
          if (!this.physicsManager.getBody(projectile.id)) {
            this.physicsManager.createProjectileBody(projectile)
          }
        }

        // Update physics simulation (handles all forces and sync)
        this.physicsManager.update(GAME_CONFIG.tickRate, this.state.players, this.state.mobs)

        // Update projectiles (gravity, speed cap, distance tracking)
        this.projectileManager.updateProjectiles(
          this.state.projectiles,
          GAME_CONFIG.tickRate,
          this.physicsManager
        )

        // Update player headings and other logic
        this.state.players.forEach(player => {
          player.update(GAME_CONFIG.tickRate)

          // Process player attack input
          if (player.processAttackInput(this.state.mobs, this.roomId)) {
            // Attack was processed, reset attack input to prevent spam
            player.input.attack = false

            // Check for projectile deflection
            this.checkProjectileDeflection(player)
          }
        })

        // Update AI module (tick-driven)
        this.state.aiModule.update()

        // Maintain mobs per map settings (spawn/remove)
        this.mobLifeCycleManager.update()

        // Update mobs (AI + combat only; physics already applied above)
        this.state.updateMobs()

        // Remove physics bodies for projectiles that should despawn (before they're removed from map)
        const toDespawn: string[] = []
        for (const [id, projectile] of this.state.projectiles.entries()) {
          if (projectile.shouldDespawn()) {
            toDespawn.push(id)
            this.physicsManager.removeBody(id)
          }
        }

        // Update projectiles (cleanup despawned - removes from map)
        this.state.updateProjectiles(GAME_CONFIG.tickRate)

        // Process battle action messages via BattleManager instance
        this.battleManager.processActionMessages().then((processedCount: number) => {
          if (processedCount > 0) {
            console.log(`⚔️ BATTLE: Processed ${processedCount} action messages`)
          }
        })

        // Log simulation health every 1000 ticks
        if (this.state.tick % 1000 === 0) {
          // Check if mobs have physics bodies
          let mobsWithBodies = 0
          for (const mob of this.state.mobs.values()) {
            if (this.physicsManager.getBody(mob.id)) {
              mobsWithBodies++
            }
          }
          console.log(
            `🔄 SIMULATION HEALTH: tick=${this.state.tick}, mobs=${this.state.mobs.size}, mobsWithBodies=${mobsWithBodies}, players=${this.state.players.size}`
          )
        }
      } catch (error) {
        console.error(`❌ SIMULATION ERROR:`, error)
        // Don't stop the simulation on error, just log it
      }
    }, GAME_CONFIG.tickRate)
  }

  // Check for projectile deflection when player attacks
  private checkProjectileDeflection(player: Player): void {
    if (!player.isAttacking) return

    for (const projectile of this.state.projectiles.values()) {
      if (projectile.isStuck) continue
      if (this.projectileManager.checkDeflection(projectile, player)) {
        console.log(`🛡️ DEFLECT: Player ${player.id} deflected projectile ${projectile.id}`)
      }
    }
  }

  // Stop the game simulation loop
  private stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval)
      this.simulationInterval = undefined
    }
  }

  // Deprecated: impact effects moved to battle damage-produced events

  // Enable mob chase behavior
  enableMobChaseBehavior() {
    this.state.enableMobChaseBehavior()
  }

  // Enable mob wander behavior
  enableMobWanderBehavior() {
    this.state.enableMobWanderBehavior()
  }
}
