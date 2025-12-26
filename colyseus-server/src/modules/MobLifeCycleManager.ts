import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { eventBus, RoomEventType } from '../events/EventBus'
import { GAME_CONFIG } from '../config/gameConfig'
import { getMobSettingsForMap, MobSpawnSettings } from '../config/mobSpawnConfig'
import { MOB_STATS } from '../config/combatConfig'
import { ProjectileManager } from './ProjectileManager'
import {
  selectMobType,
  calculateMobRadius,
  type MobTypeConfig,
} from '../config/mobTypesConfig'
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
  private lastSpawnAt = 0
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

  // Seed initial mobs up to desiredCount
  seedInitial(): void {
    // Clear existing via GameState helper (emits removal events)
    this.state.clearAllMobs()
    const target = this.settings.desiredCount
    for (let i = 0; i < target; i++) {
      this.spawnOne()
    }
    this.lastSpawnAt = Date.now()
  }

  // Called by GameRoom every tick
  update(): void {
    // Clean up mobs ready to be removed (new simple cleanup system)
    this.cleanupReadyMobs()

    // Count only alive mobs
    const aliveMobs = this.getAliveMobCount()

    // Remove excess mobs if over max
    const maxAllowed = this.settings.maxMobs ?? this.settings.desiredCount
    if (aliveMobs > maxAllowed) {
      const toRemove = aliveMobs - maxAllowed
      this.removeExtraMobs(toRemove)
    }

    // Spawn if under target and interval elapsed
    // Use TOTAL count (alive + dead) so we don't spawn until dead mobs are removed
    if (!this.settings.autoSpawn) return

    const target = this.settings.desiredCount
    const totalMobs = this.getTotalMobCount() // Count all mobs (alive + dead)
    if (totalMobs >= target) return // Wait until dead mobs are removed

    const now = Date.now()
    if (now - this.lastSpawnAt < this.settings.spawnIntervalMs) return

    const numToSpawn = Math.min(
      target - totalMobs,
      this.settings.batchSize ?? 1
    )
    for (let i = 0; i < numToSpawn; i++) {
      this.spawnOne()
    }
    this.lastSpawnAt = now
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

  // Get count of alive mobs only
  private getAliveMobCount(): number {
    let count = 0
    for (const mob of this.state.mobs.values()) {
      if (mob.isAlive) count++
    }
    return count
  }

  // Get total count of all mobs (alive + dead)
  // Used for spawn decisions to prevent spawning until dead mobs are removed
  private getTotalMobCount(): number {
    return this.state.mobs.size
  }

  // Spawn a mob at a specific location (for debugging/events)
  spawnMobAt(x: number, y: number): void {
    const rand2 = Math.random().toString(36).slice(2, 4)
    const mobId = `mob-${this.state.tick}-${rand2}`

    // Select mob type using weighted random selection
    const mobTypeConfig = selectMobType()
    
    // Calculate radius for this mob
    const radius = calculateMobRadius(mobTypeConfig)
    
    // Build attack strategies based on mob type config
    const attackStrategies = this.buildAttackStrategies(mobTypeConfig, radius)
    
    // Merge stats from config with defaults
    const stats = {
      attackRange: mobTypeConfig.stats.attackRange ?? MOB_STATS.attackRange,
      chaseRange: mobTypeConfig.stats.chaseRange ?? MOB_STATS.chaseRange,
      maxHealth: mobTypeConfig.stats.maxHealth ?? MOB_STATS.maxHealth,
      attackDamage: mobTypeConfig.stats.attackDamage ?? MOB_STATS.attackDamage,
      attackDelay: mobTypeConfig.stats.attackDelay ?? MOB_STATS.attackDelay,
      defense: mobTypeConfig.stats.defense ?? MOB_STATS.defense,
      armor: mobTypeConfig.stats.armor ?? MOB_STATS.armor,
      density: mobTypeConfig.stats.density ?? MOB_STATS.density,
      maxMoveSpeed: mobTypeConfig.stats.maxMoveSpeed ?? MOB_STATS.maxMoveSpeed,
    }

    const mob = new Mob({
      id: mobId,
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
      mobTypeId: mobTypeConfig.id, // Store mob type ID for UI/debugging
    })

    this.state.mobs.set(mobId, mob)
    this.state.aiModule.registerMob(mob, {
      behaviors: ['attack', 'chase', 'wander', 'boundaryAware', 'idle'],
      perception: { range: 50, fov: 120 },
      memory: { duration: 5000 },
    })

    eventBus.emitRoomEvent(this.roomId, RoomEventType.MOB_SPAWNED, { mob })
  }

  private spawnOne(): void {
    const { x, y } = this.pickSpawnPosition()
    this.spawnMobAt(x, y)
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

  private removeExtraMobs(count: number): void {
    // Simple policy: remove oldest by id lexicographic (stable)
    const ids = Array.from(this.state.mobs.keys()).sort()
    for (let i = 0; i < count && i < ids.length; i++) {
      this.removeMob(ids[i])
    }
  }

  private pickSpawnPosition(): SpawnContext {
    const margin = this.settings.spawnMargin ?? GAME_CONFIG.mobSpawnMargin
    const x = Math.random() * (this.state.width - 2 * margin) + margin
    const y = Math.random() * (this.state.height - 2 * margin) + margin
    return { x, y }
  }
}

export default MobLifeCycleManager


