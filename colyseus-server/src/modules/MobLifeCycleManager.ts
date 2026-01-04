import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { eventBus, RoomEventType } from '../events/EventBus'
import { GAME_CONFIG } from '../config/gameConfig'
import { getMobSettingsForMap, MobSpawnSettings } from '../config/mobSpawnConfig'
import { MOB_STATS } from '../config/combatConfig'
import { ProjectileManager } from './ProjectileManager'
import {
  getMobTypeById,
  calculateMobRadius,
  type MobTypeConfig,
} from '../config/mobTypesConfig'
import { MAP_CONFIG, MobSpawnArea } from '../config/mapConfig'
import { createAttackStrategies } from '../config/attackStrategyFactory'
import { MeleeAttackStrategy } from '../ai/strategies/MeleeAttackStrategy'

interface SpawnContext {
  x: number
  y: number
}

export class MobLifeCycleManager {
  private readonly state: GameState
  private readonly roomId: string
  private readonly settings: MobSpawnSettings
  // Track last spawn time per area ID
  private lastSpawnAtByArea: Map<string, number> = new Map()
  private projectileManager: ProjectileManager | null = null

  constructor(roomId: string, state: GameState) {
    this.roomId = roomId
    this.state = state
    this.settings = getMobSettingsForMap(state.mapId)
  }

  // Set projectile manager (called from GameRoom after initialization)
  setProjectileManager(projectileManager: ProjectileManager): void {
    this.projectileManager = projectileManager
  }

  // Seed initial mobs for all defined areas
  seedInitial(): void {
    // Clear existing via GameState helper (emits removal events)
    this.state.clearAllMobs()
    
    // Spawn initial mobs for each area
    const areas = MAP_CONFIG.mobSpawnAreas || []
    for (const area of areas) {
      for (let i = 0; i < area.count; i++) {
        this.spawnMobInArea(area)
      }
      this.lastSpawnAtByArea.set(area.id, Date.now())
    }
  }

  // Called by GameRoom every tick
  update(): void {
    // Clean up mobs ready to be removed (new simple cleanup system)
    this.cleanupReadyMobs()

    if (!this.settings.autoSpawn) return
    
    // Check each spawn area
    const areas = MAP_CONFIG.mobSpawnAreas || []
    const now = Date.now()
    
    for (const area of areas) {
      this.maintainAreaPopulation(area, now)
    }
  }

  // Maintain population for a specific area
  private maintainAreaPopulation(area: MobSpawnArea, now: number): void {
    const areaId = area.id
    const desiredCount = area.count
    const interval = area.spawnIntervalMs ?? this.settings.spawnIntervalMs
    
    // Count existing mobs in this area (alive + dead but not removed)
    // We count total mobs to prevent overspawning while dead bodies linger
    let currentCount = 0
    for (const mob of this.state.mobs.values()) {
        if (mob.spawnAreaId === areaId) {
            currentCount++
        }
    }
    
    if (currentCount >= desiredCount) return

    // Check spawn interval
    const lastSpawn = this.lastSpawnAtByArea.get(areaId) || 0
    if (now - lastSpawn < interval) return

    // Spawn one mob
    this.spawnMobInArea(area)
    this.lastSpawnAtByArea.set(areaId, now)
  }

  // Clean up mobs that are ready to be removed (simple cleanup system)
  private cleanupReadyMobs(): void {
    const respawnDelay = this.settings.respawnDelayMs ?? 5000
    const toRemove: string[] = []
    
    for (const [id, mob] of this.state.mobs.entries()) {
      if (mob.readyToBeRemoved(respawnDelay)) {
        toRemove.push(id)
      }
    }
    
    // Remove all ready mobs
    for (const id of toRemove) {
      this.removeMob(id)
    }
  }

  // Extract removal logic to reusable method
  private removeMob(id: string): void {
    const mob = this.state.mobs.get(id)
    if (!mob) return
    
    // Unregister from AI
    this.state.aiModule.unregisterMob(id)
    
    // Remove from state
    this.state.mobs.delete(id)
    
    // Emit event
    eventBus.emitRoomEvent(this.roomId, RoomEventType.MOB_REMOVED, { mob })
  }

  // Spawn a mob at a specific location (for debugging/events)
  spawnMobAt(x: number, y: number): void {
    // For debug spawns, we use a random mob type or specific logic?
    // Let's keep it simple and just use a default type or random one from old logic 
    // IF we want to keep `spawnMobAt` working for debug commands.
    // For now, let's use a "balanced" mob type as default for debug spawns
    const mobTypeConfig = getMobTypeById('balanced')
    if (!mobTypeConfig) return

    const rand2 = Math.random().toString(36).slice(2, 4)
    const mobId = `mob-debug-${this.state.tick}-${rand2}`
    
    this.createAndRegisterMob(mobId, x, y, mobTypeConfig, 'debug_spawn')
  }

  // Spawn a mob in a specific area
  private spawnMobInArea(area: MobSpawnArea): void {
    const mobTypeConfig = getMobTypeById(area.mobType)
    if (!mobTypeConfig) {
      console.warn(`⚠️ MobLifeCycleManager: Unknown mob type '${area.mobType}' for area '${area.id}'`)
      return
    }

    const { x, y } = this.pickSpawnPositionInArea(area)
    
    const rand2 = Math.random().toString(36).slice(2, 4)
    const mobId = `mob-${area.id}-${this.state.tick}-${rand2}`

    this.createAndRegisterMob(mobId, x, y, mobTypeConfig, area.id)
  }

  // Core logic to create mob instance and register it
  private createAndRegisterMob(
    id: string, 
    x: number, 
    y: number, 
    mobTypeConfig: MobTypeConfig, 
    spawnAreaId: string
  ): void {
    
    // Calculate radius for this mob
    const radius = calculateMobRadius(mobTypeConfig)
    
    // Build attack strategies based on mob type config
    const attackStrategies = this.buildAttackStrategies(mobTypeConfig, radius)
    
    // Merge stats from config with defaults
    const stats = {
      attackRange: mobTypeConfig.stats.attackRange ?? MOB_STATS.attackRange,
      chaseRange: mobTypeConfig.stats.chaseRange ?? MOB_STATS.chaseRange,
      maxHealth: mobTypeConfig.hp ?? mobTypeConfig.stats.maxHealth ?? MOB_STATS.maxHealth,
      attackDamage: mobTypeConfig.stats.attackDamage ?? MOB_STATS.attackDamage,
      attackDelay: mobTypeConfig.stats.attackDelay ?? MOB_STATS.attackDelay,
      defense: mobTypeConfig.stats.defense ?? MOB_STATS.defense,
      armor: mobTypeConfig.stats.armor ?? MOB_STATS.armor,
      density: mobTypeConfig.stats.density ?? MOB_STATS.density,
      maxMoveSpeed: mobTypeConfig.stats.maxMoveSpeed ?? MOB_STATS.maxMoveSpeed,
    }

    const mob = new Mob({
      id: id,
      x,
      y,
      vx: 0,
      vy: 0,
      radius,
      attackRange: stats.attackRange,
      chaseRange: stats.chaseRange,
      maxHealth: stats.maxHealth,
      attackDamage: stats.attackDamage,
      attackDelay: stats.attackDelay,
      defense: stats.defense,
      armor: stats.armor,
      density: stats.density,
      maxMoveSpeed: stats.maxMoveSpeed,
      attackStrategies,
      mobTypeId: mobTypeConfig.id,
      spawnAreaId: spawnAreaId,
    })

    this.state.mobs.set(id, mob)
    this.state.aiModule.registerMob(mob, {
      behaviors: ['attack', 'chase', 'wander', 'boundaryAware', 'idle'],
      // Increase perception so they can find players in their zone easier
      perception: { range: 100, fov: 140 }, 
      memory: { duration: 5000 },
    })

    eventBus.emitRoomEvent(this.roomId, RoomEventType.MOB_SPAWNED, { mob })
  }

  /**
   * Build attack strategies for a mob type
   */
  private buildAttackStrategies(mobTypeConfig: MobTypeConfig, radius: number): any[] {
    if (!this.projectileManager) {
      console.warn(`⚠️ MobLifeCycleManager: projectileManager not set, skipping ${mobTypeConfig.name} spawn`)
      return []
    }

    const strategies: any[] = []

    // Create strategies from the new config structure
    for (const strategyConfig of mobTypeConfig.atkStrategies) {
      const createdStrategies = createAttackStrategies(
        strategyConfig,
        radius,
        this.projectileManager,
        this.state
      )
      strategies.push(...createdStrategies)
    }

    // Fallback: if no strategies were created, add melee as default
    if (strategies.length === 0) {
      strategies.push(new MeleeAttackStrategy(this.projectileManager, this.state))
    }

    return strategies
  }

  private pickSpawnPositionInArea(area: MobSpawnArea): SpawnContext {
    // Random position within area bounds
    const x = area.x + Math.random() * area.width
    const y = area.y + Math.random() * area.height
    return { x, y }
  }
}

export default MobLifeCycleManager


