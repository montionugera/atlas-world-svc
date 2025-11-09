import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { eventBus, RoomEventType } from '../events/EventBus'
import { GAME_CONFIG } from '../config/gameConfig'
import { getMobSettingsForMap, MobSpawnSettings } from '../config/mobSpawnConfig'
import { MOB_STATS, MOB_TYPE_STATS, SPEAR_THROWER_STATS, calculateSpearMaxRange } from '../config/combatConfig'
import { PROJECTILE_GRAVITY } from '../config/physicsConfig'
import { MeleeAttackStrategy } from '../ai/strategies/MeleeAttackStrategy'
import { SpearThrowAttackStrategy } from '../ai/strategies/SpearThrowAttackStrategy'
import { ProjectileManager } from './ProjectileManager'

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

  private spawnOne(): void {
    const { x, y } = this.pickSpawnPosition()

    const rand2 = Math.random().toString(36).slice(2, 4)
    const mobId = `mob-${this.state.tick}-${rand2}`

    // Simple randomized stats from config
    const radius = 1 + 3 * Math.random()
    const mobType = Math.random()
    let attackRange = MOB_STATS.attackRange
    let chaseRange = MOB_STATS.chaseRange
    let attackStrategies: any[] = []
    
    // Calculate spear max range based on this mob's radius (visual height = radius * 2)
    const visualHeight = radius * 2
    const calculatedMaxRange = calculateSpearMaxRange(
      visualHeight,
      PROJECTILE_GRAVITY,
      SPEAR_THROWER_STATS.spearSpeed
    )
    
    // Determine mob type and attack strategies
    if (mobType < 0.2) {
      // Spear thrower (only spear strategy)
      attackRange = calculatedMaxRange // Use calculated max range for attack decision
      chaseRange = MOB_STATS.chaseRange
      if (this.projectileManager) {
        attackStrategies = [
          new SpearThrowAttackStrategy(
            this.projectileManager,
            this.state,
            {
              damage: SPEAR_THROWER_STATS.spearDamage,
              maxRange: calculatedMaxRange,
            }
          ),
        ]
      }
    } else if (mobType < 0.4) {
      // Hybrid (melee + spear, choose by distance)
      attackRange = MOB_STATS.attackRange
      chaseRange = MOB_STATS.chaseRange
      if (this.projectileManager) {
        attackStrategies = [
          new MeleeAttackStrategy(),
          new SpearThrowAttackStrategy(
            this.projectileManager,
            this.state,
            {
              damage: SPEAR_THROWER_STATS.spearDamage,
              maxRange: calculatedMaxRange,
            }
          ),
        ]
      } else {
        attackStrategies = [new MeleeAttackStrategy()]
      }
    } else if (mobType < 0.7) {
      // Aggressive mobs (melee only)
      attackRange = MOB_TYPE_STATS.aggressive.attackRange
      chaseRange = MOB_TYPE_STATS.aggressive.chaseRange
      attackStrategies = [new MeleeAttackStrategy()]
    } else if (mobType < 0.9) {
      // Defensive mobs (melee only)
      attackRange = MOB_TYPE_STATS.defensive.attackRange
      chaseRange = MOB_TYPE_STATS.defensive.chaseRange
      attackStrategies = [new MeleeAttackStrategy()]
    }
    // Balanced mobs (0.9-1.0) use default MOB_STATS values, melee only
    if (attackStrategies.length === 0) {
      attackStrategies = [new MeleeAttackStrategy()]
    }

    const mob = new Mob({
      id: mobId,
      x,
      y,
      vx: 0,
      vy: 0,
      radius,
      attackRange,
      chaseRange,
      maxMoveSpeed: MOB_STATS.maxMoveSpeed,
      attackStrategies,
    })

    this.state.mobs.set(mobId, mob)
    this.state.aiModule.registerMob(mob, {
      behaviors: ['attack', 'chase', 'wander', 'boundaryAware', 'idle'],
      perception: { range: 50, fov: 120 },
      memory: { duration: 5000 },
    })

    eventBus.emitRoomEvent(this.roomId, RoomEventType.MOB_SPAWNED, { mob })
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


