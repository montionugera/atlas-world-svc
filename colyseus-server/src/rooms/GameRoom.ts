import { Room, Client } from 'colyseus'
import { GameState } from '../schemas/GameState'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'
import { BattleManager } from '../modules/BattleManager'
import { BattleModule } from '../modules/BattleModule'
import { ProjectileManager } from '../modules/ProjectileManager'
import { TrapManager } from '../modules/TrapManager'
import { eventBus, RoomEventType } from '../events/EventBus'
import { MobLifeCycleManager } from '../modules/MobLifeCycleManager'
import { registerRoom, unregisterRoom } from '../api'
import * as planck from 'planck'

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
  public trapManager!: TrapManager

  onCreate(options: GameRoomOptions) {
    console.log(`🎮 GameRoom created with mapId: ${options.mapId || 'map-01-sector-a'}`)

    // Register room for REST API access
    registerRoom(this)

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

    // Initialize trap manager
    this.trapManager = new TrapManager(this.state, this.battleModule)

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
    this.setPatchRate(50);
    this.startSimulation()

    // Handle player movement input → apply force to physics body (authoritative physics)
    this.onMessage('player_input_move', (client: Client, data: { vx: number; vy: number }) => {
      console.log(`🎮 MOVE: ${client.sessionId} ${data?.vx} ${data?.vy}`)
      const player = this.state.getPlayer(client.sessionId)
      if (!player) return
      
      // Prevent dead players from moving
      if (!player.isAlive) {
        // Clear input to stop any movement
        this.state.updatePlayerInput(client.sessionId, 0, 0)
        return
      }
      
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

        // Handle direct actions (one-shot triggers)
        if (pressed && action === 'useItem') {
           // Basic Trap Placement
           const now = Date.now()
           if (now - player.lastTrapTime >= player.trapCooldown) {
               console.log(`🧨 ACTION: Player ${player.id} placing trap`)
               const trap = this.trapManager.createTrap(
                 player.x,
                 player.y,
                 player.id,
                 'damage', // Default to damage trap for now
                 20,
                 2
               )
               this.state.traps.set(trap.id, trap)
               player.lastTrapTime = now
           } else {
               const remaining = Math.ceil((player.trapCooldown - (now - player.lastTrapTime)) / 1000)
               console.log(`⏳ ACTION: Trap cooldown not ready (${remaining}s)`)
           }
        }
      }
    )

    // Handle bot mode toggle
    this.onMessage('player_toggle_bot', (client: Client, data: { enabled: boolean }) => {
      const player = this.state.getPlayer(client.sessionId)
      if (!player) return
      
      const enabled = data?.enabled ?? false
      console.log(`🤖 PLAYER BOT MODE: ${client.sessionId} set to ${enabled}`)
      player.setBotMode(enabled)

      if (enabled) {
        // Register player with AI module
        this.state.aiModule.registerAgent(player, {
          behaviors: ['attack', 'chase', 'wander', 'avoidBoundary'],
          perception: { range: 300 }, // Player has larger perception
          behaviorPriorities: {
            avoidBoundary: 10,
            attack: 8,
            chase: 5,
            wander: 1
          }
        })
      } else {
        // Unregister player from AI module
        this.state.aiModule.unregisterAgent(player.id)
      }
    })

    // Debug: Spawn Trap
    this.onMessage('debug_spawn_trap', (client: Client, data: { type: string }) => {
      const player = this.state.getPlayer(client.sessionId)
      if (!player) return
      
      const type = (data && data.type) || 'damage'
      console.log(`⚡ DEBUG SPAWN TRAP: near ${client.sessionId}`)
      
      const trap = this.trapManager.createTrap(
        player.x, 
        player.y, 
        player.id, 
        type as any, 
        type === 'damage' ? 20 : 3000, // 20 dmg or 3s duration
        2.5 // radius
      )
      
      this.state.traps.set(trap.id, trap)
    })

    // Debug: Teleport player
    this.onMessage('debug_teleport', (client: Client, data: { x: number; y: number }) => {
      const player = this.state.getPlayer(client.sessionId)
      if (!player) return
      
      console.log(`⚡ DEBUG TELEPORT: ${client.sessionId} to ${data.x}, ${data.y}`)
      
      // Update physics body position
      const body = this.physicsManager.getBody(client.sessionId)
      if (body) {
        body.setPosition(planck.Vec2(data.x, data.y))
        // Reset velocity
        body.setLinearVelocity(planck.Vec2(0, 0))
      }
      
      // Update state position (will be synced next tick)
      player.x = data.x
      player.y = data.y
    })

    // Debug: Spawn Mob
    this.onMessage('debug_spawn_mob', (client: Client, data: { x: number; y: number }) => {
      console.log(`⚡ DEBUG SPAWN MOB: near ${client.sessionId} at ${data.x}, ${data.y}`)
      this.mobLifeCycleManager.spawnMobAt(data.x, data.y)
    })

    // Debug: Force Die
    this.onMessage('debug_force_die', (client: Client) => {
      const player = this.state.getPlayer(client.sessionId)
      if (player) {
         console.log(`💀 DEBUG: Force die for ${client.sessionId}`)
         player.die()
      }
    })

    // Player Respawn
    this.onMessage('player_respawn', (client: Client) => {
      const player = this.state.getPlayer(client.sessionId)
      if (!player) return
      
      // Optionally check if player is dead?
      // if (player.isAlive) return
      
      console.log(`♻️ PLAYER RESPAWN: ${client.sessionId}`)
      
      // Respawn at stored spawn location (from gameplay settings)
      const respawnX = player.settingGameplay.spawnX
      const respawnY = player.settingGameplay.spawnY
      
      player.respawn(respawnX, respawnY)
      
      // Update physics body
      const body = this.physicsManager.getBody(client.sessionId)
      if (body) {
         body.setPosition(planck.Vec2(respawnX, respawnY))
         body.setLinearVelocity(planck.Vec2(0, 0))
         body.setAwake(true)
         body.setActive(true) // Ensure body is active
         body.setAngularVelocity(0)
      }
    })
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
    
    // Unregister from AI module (if registered)
    this.state.aiModule.unregisterAgent(client.sessionId)
  }

  onDispose() {
    console.log(`🗑️ GameRoom disposed`)

    // Unregister room from REST API
    unregisterRoom(this.roomId)

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
    // Use Colyseus's built-in simulation loop
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));
  }

  // Main update loop
  update(deltaTime: number) {
      // console.log(`[Tick Start] ${this.state.tick}`)
      try {
        // Create physics bodies for new projectiles
        for (const projectile of this.state.projectiles.values()) {
          if (!this.physicsManager.getBody(projectile.id)) {
            this.physicsManager.createProjectileBody(projectile)
          }
        }

        // Update physics simulation (handles all forces and sync)
        this.physicsManager.update(deltaTime, this.state.players, this.state.mobs)

        // Update projectiles (gravity, speed cap, distance tracking)
        this.projectileManager.updateProjectiles(
          this.state.projectiles,
          deltaTime,
          this.physicsManager
        )

        // Update player headings and other logic
        this.state.players.forEach(player => {
          // Skip dead players for updates
          if (!player.isAlive) {
            // Clear input for dead players
            player.input.clear()
            return
          }

          player.update(deltaTime, this.state)

          if (player.isBotMode && Math.random() < 0.01) {
             console.log(`[Server] Player ${player.sessionId} pos: ${player.x}, ${player.y}`)
          }

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
        this.state.updateProjectiles(deltaTime)

        // Update traps
        this.trapManager.update(this.state.traps)

        // Process battle action messages via BattleManager instance
        this.battleManager.processActionMessages().then((processedCount: number) => {
          if (processedCount > 0) {
            console.log(`⚔️ BATTLE: Processed ${processedCount} action messages`)
          }
        })

        // Log simulation health every 1000 ticks
        if (this.state.tick % 1000 === 0) { // Revert to 1000
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
      // console.log(`[Tick End] ${this.state.tick}`)
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
