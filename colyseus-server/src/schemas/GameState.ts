import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema'
import { Mob } from './Mob'
import { Player } from './Player'
import { Projectile } from './Projectile'
import { GAME_CONFIG } from '../config/gameConfig'
import { MobAIModule } from '../ai/MobAIModule'
import { AIWorldInterface } from '../ai/AIWorldInterface'
// Removed global BattleManager singleton - now using room-scoped instances
import { eventBus, RoomEventType } from '../events/EventBus'
import { MOB_STATS, MOB_TYPE_STATS } from '../config/combatConfig'
import { MeleeAttackStrategy } from '../ai/strategies/MeleeAttackStrategy'

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>()
  @type({ map: Mob }) mobs = new MapSchema<Mob>()
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>()
  @type('number') tick: number = 0
  @type('string') mapId: string = 'map-01-sector-a'
  @type('string') roomId: string = ''
  @type('number') width: number = GAME_CONFIG.worldWidth
  @type('number') height: number = GAME_CONFIG.worldHeight

  public aiModule: MobAIModule
  public worldInterface: AIWorldInterface
  public battleManager: any // BattleManager instance
  public mobLifeCycleManager: any // MobLifeCycleManager instance

  constructor(mapId: string = 'map-01-sector-a', roomId: string = '') {
    super()
    this.mapId = mapId
    this.roomId = roomId
    this.width = GAME_CONFIG.worldWidth
    this.height = GAME_CONFIG.worldHeight
    this.tick = 0

    // BattleManager is now room-scoped, not global singleton

    // Initialize AI module
    this.worldInterface = new AIWorldInterface(this)
    this.aiModule = new MobAIModule(this.worldInterface)
    this.aiModule.start()
  }
  public clearAllMobs() {
    for (const mob of this.mobs.values()) {
      eventBus.emitRoomEvent(this.roomId, RoomEventType.MOB_REMOVED, { mob })
    }
    this.mobs.clear()
  }

  // Initialize mobs - delegates to MobLifeCycleManager if available
  public reInitializeMobs() {
    if (this.mobLifeCycleManager) {
      // Use lifecycle manager for map-based spawn settings
      this.mobLifeCycleManager.seedInitial()
      return
    }

    // Fallback: legacy behavior using GAME_CONFIG.mobCount
    // (Kept for backward compatibility or when manager not initialized)
    this.clearAllMobs()

    for (let i = 1; i <= GAME_CONFIG.mobCount; i++) {
      // Spawn mobs spread out across the map with more margin from boundaries
      const x = Math.random() * (this.width - 40) + 20 // More margin from boundaries
      const y = Math.random() * (this.height - 40) + 20 // More margin from boundaries
      const vx = (Math.random() - 0.5) * GAME_CONFIG.mobSpeedRange
      const vy = (Math.random() - 0.5) * GAME_CONFIG.mobSpeedRange

      const rand2 = Math.random().toString(36).slice(2, 4) // 2 random chars
      const mobId = `mob-${i}-${rand2}` // index + 2 random chars
      const radius = 1 + 3 * Math.random() // example variability

      // Create different mob types with different ranges
      const mobType = Math.random()
      let attackRange = MOB_STATS.attackRange
      let chaseRange = MOB_STATS.chaseRange

      if (mobType < 0.3) {
        // Aggressive mobs - longer attack range and chase range
        attackRange = MOB_TYPE_STATS.aggressive.attackRange
        chaseRange = MOB_TYPE_STATS.aggressive.chaseRange
      } else if (mobType < 0.6) {
        // Defensive mobs - shorter attack range and chase range
        attackRange = MOB_TYPE_STATS.defensive.attackRange
        chaseRange = MOB_TYPE_STATS.defensive.chaseRange
      }
      // Default ranges for balanced mobs (0.6-1.0)

      // Ensure all mobs have at least melee attack strategy
      const mob = new Mob({
        id: mobId,
        x,
        y,
        vx,
        vy,
        radius,
        attackRange,
        chaseRange,
        maxMoveSpeed: MOB_STATS.maxMoveSpeed,
        attackStrategies: [new MeleeAttackStrategy()],
      })
      this.mobs.set(mobId, mob)

      // Register mob with AI module
      this.aiModule.registerMob(mob, {
        behaviors: ['attack', 'chase', 'wander', 'boundaryAware', 'idle'],
        perception: { range: 50, fov: 120 },
        memory: { duration: 5000 },
      })

      // Emit event for room to handle side effects (physics, battle registration)
      eventBus.emitRoomEvent(this.roomId, RoomEventType.MOB_SPAWNED, { mob })
    }
  }

  // Add a player to the game
  addPlayer(sessionId: string, name: string) {
    // Spawn new players at map center for visibility
    const spawnX = this.width / 2
    const spawnY = this.height / 2
    const player = new Player(sessionId, name, spawnX, spawnY)
    this.players.set(sessionId, player)

    // Emit event for room to handle side effects (physics, battle registration)
    eventBus.emitRoomEvent(this.roomId, RoomEventType.PLAYER_JOINED, { player })

    return player
  }

  // Remove a player from the game
  removePlayer(sessionId: string) {
    const player = this.players.get(sessionId)
    if (player) {
      // Emit event for room to handle side effects (physics cleanup, battle unregistration)
      eventBus.emitRoomEvent(this.roomId, RoomEventType.PLAYER_LEFT, { player })
    }

    this.players.delete(sessionId)
  }

  // Get a player by session ID
  getPlayer(sessionId: string): Player | undefined {
    return this.players.get(sessionId)
  }

  // Update mobs (AI + combat only; physics handled in GameRoom)
  updateMobs() {
    for (const mob of this.mobs.values()) {
      // Skip dead mobs - lifecycle manager will remove them
      if (!mob.isAlive) continue

      // AI is handled by MobAIModule (already running)
      // Update mob: cooldowns, position, heading, and attack logic
      // Attack events are now emitted to event bus in updateAttack
      mob.update(GAME_CONFIG.tickRate, this)
    }

    this.tick++
  }
  // Update player input (movement)
  updatePlayerInput(sessionId: string, vx: number, vy: number) {
    const player = this.getPlayer(sessionId)
    if (player) {
      player.input.setMovement(vx, vy)
    }
  }

  // Update player action input
  updatePlayerAction(sessionId: string, action: string, pressed: boolean) {
    const player = this.getPlayer(sessionId)
    if (player) {
      player.input.setAction(action, pressed)
    }
  }

  // Behavior toggles (placeholders for future AI policy wiring)
  enableMobChaseBehavior() {
    // Intentionally left as no-op; AI module can switch behaviors internally
  }

  enableMobWanderBehavior() {
    // Intentionally left as no-op; AI module can switch behaviors internally
  }

  // Stop AI module (for test cleanup)
  stopAI() {
    if (this.aiModule) {
      this.aiModule.stop()
    }
  }

  // Update projectiles (cleanup and despawn)
  updateProjectiles(deltaTime: number): void {
    const toRemove: string[] = []
    
    for (const [id, projectile] of this.projectiles.entries()) {
      if (projectile.shouldDespawn()) {
        toRemove.push(id)
      }
    }
    
    for (const id of toRemove) {
      this.projectiles.delete(id)
    }
  }
}
