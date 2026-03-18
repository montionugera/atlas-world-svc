import { Projectile } from '../schemas/Projectile'
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { WorldLife } from '../schemas/WorldLife'
import { BattleModule } from './BattleModule'
import { BattleManager } from './BattleManager'
import { GameState } from '../schemas/GameState'
import { SPEAR_THROWER_STATS, MELEE_PROJECTILE_STATS } from '../config/combatConfig'
import { PROJECTILE_GRAVITY } from '../config/physicsConfig'
import { eventBus, RoomEventType } from '../events/EventBus'

export class ProjectileManager {
  private gameState: GameState
  private battleModule: BattleModule
  private gravity: number = PROJECTILE_GRAVITY
  private maxSpeed: number = 2000 // Raised from 36 to support fast projectiles

  private battleManager?: BattleManager

  constructor(gameState: GameState, battleModule: BattleModule, battleManager?: BattleManager) {
    this.gameState = gameState
    this.battleModule = battleModule
    this.battleManager = battleManager
  }

  /**
   * Create a melee projectile from mob to target
   * Short range, fast speed for near-instant hits
   */
  createMelee(
    actor: WorldLife, 
    targetX: number, 
    targetY: number, 
    damage: number,
    maxRange: number = MELEE_PROJECTILE_STATS.meleeMaxRange,
    radius: number = MELEE_PROJECTILE_STATS.projectileRadius,
    speed: number = MELEE_PROJECTILE_STATS.meleeSpeed
  ): Projectile {
    const dx = targetX - actor.x
    const dy = targetY - actor.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Calculate angle to target
    const angle = Math.atan2(dy, dx)
    
    // Calculate initial velocity components
    const vx = speed * Math.cos(angle)
    const vy = speed * Math.sin(angle)

    // Spawn at edge of actor + small offset
    const spawnOffset = ((actor as any).radius || 1) + 0.5
    const spawnX = actor.x + Math.cos(angle) * spawnOffset
    const spawnY = actor.y + Math.sin(angle) * spawnOffset
    
    // Create projectile with melee stats
    const projectileId = `projectile-melee-${this.gameState.tick}-${Math.random().toString(36).slice(2, 4)}`
    const projectile = new Projectile(
      projectileId,
      spawnX,
      spawnY,
      vx,
      vy,
      actor.id,
      damage,
      'melee', // type
      maxRange,
      radius,
      MELEE_PROJECTILE_STATS.projectileLifetime,
      actor.teamId
    )
    
    projectile.piercing = true; // Melee attacks cleave through multiple enemies!
    
    return projectile
  }

  /**
   * Create a spear projectile from mob to target
   * Calculates trajectory based on configurable physics
   */
  createSpear(
    mob: Mob, 
    targetX: number, 
    targetY: number, 
    damage: number, 
    maxRange: number = SPEAR_THROWER_STATS.spearMaxRange,
    radius: number = SPEAR_THROWER_STATS.projectileRadius,
    speed: number = this.maxSpeed,
    type: string = 'spear'
  ): Projectile {
    const dx = targetX - mob.x
    const dy = targetY - mob.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Calculate angle to target
    const angle = Math.atan2(dy, dx)
    
    // Use provided speed
    const maxSpeed = speed
    
    // Calculate initial velocity components
    const vx = maxSpeed * Math.cos(angle)
    const vy = maxSpeed * Math.sin(angle)

    // Spawn at edge of mob
    const spawnOffset = (mob.radius || 1) + 0.5
    const spawnX = mob.x + Math.cos(angle) * spawnOffset
    const spawnY = mob.y + Math.sin(angle) * spawnOffset
    
    // Create projectile with configurable radius
    const projectileId = `projectile-${this.gameState.tick}-${Math.random().toString(36).slice(2, 4)}`
    const projectile = new Projectile(
      projectileId,
      spawnX,
      spawnY,
      vx,
      vy,
      mob.id,
      damage,
      type,
      maxRange,
      radius,
      SPEAR_THROWER_STATS.projectileLifetime,
      mob.teamId
    )
    
    return projectile
  }

  /**
   * Update all projectiles: apply gravity, cap speed, track distance
   */
  updateProjectiles(projectiles: Map<string, Projectile>, deltaTime: number, physicsManager: any): void {
    for (const projectile of projectiles.values()) {
      if (projectile.isStuck) continue
      
      // Update physics (gravity, speed cap, distance tracking) - uses configurable values
      physicsManager.updateProjectile(projectile, deltaTime, this.gravity, this.maxSpeed)
      
      // Sync position from physics body
      const body = physicsManager.getBody(projectile.id)
      if (body) {
        const position = body.getPosition()
        projectile.x = position.x
        projectile.y = position.y
      }
    }
  }

  /**
   * Handle projectile collision with living entities (Players or Mobs)
   * Projectiles pierce through (don't stop), but only damage once per target
   */
  handleEntityCollision(projectile: Projectile, target: WorldLife): void {
    if (!projectile.piercing && projectile.hitTargets.size > 0) return // Non-piercing hit its limit
    if (projectile.hitTargets.has(target.id)) return // Already hit this target
    
    // 1. Ignore if target is the owner (shooter)
    if (projectile.ownerId === target.id) return
    
    // 2. Ignore if target is on the same team (and a team is actually set)
    if (projectile.teamId && target.teamId && projectile.teamId === target.teamId) return
    
    const attacker = this.gameState.mobs.get(projectile.ownerId) || this.gameState.players.get(projectile.ownerId)
    
    // Route damage through BattleManager queue if available (throttled)
    if (this.battleManager) {
        // Create attack message
        const message = BattleManager.createAttackMessage(
            projectile.ownerId,
            target.id,
            projectile.damage,
            projectile.radius * 2 // approx range
        )
        
        // Add projectile info to payload
        const payload = message.actionPayload as any
        payload.projectileDetail = {
            id: projectile.id,
            type: projectile.type,
            damage: projectile.damage,
            vx: projectile.vx,
            vy: projectile.vy
        }
        payload.attackType = 'projectile' 
        
        console.log(`📨 PROJECTILE: Queuing hit ${projectile.id} on ${target.id}`)
        this.battleManager.addActionMessage(message)
        
    } else {
        // Fallback: Apply damage directly via BattleModule (legacy/unthrottled)
        if (attacker && attacker.isAlive) {
          // Use BattleModule to apply damage
          const damage = this.battleModule.calculateDamage(
            { attackDamage: projectile.damage } as WorldLife,
            target
          )
          const targetDied = this.battleModule.applyDamage(target, damage, { eventId: projectile.id })
          
          // Calculate impulse vector from projectile velocity
          const vx = projectile.vx
          const vy = projectile.vy
          const speedSq = vx * vx + vy * vy
          let nx: number
          let ny: number
          // If vx/vy are effectively zero (stale replication / sensor-collision moment),
          // derive knockback direction from attacker -> target.
          if (speedSq > 0.0001) {
            const speed = Math.sqrt(speedSq) || 1
            nx = vx / speed
            ny = vy / speed
          } else {
            const dx = target.x - attacker.x
            const dy = target.y - attacker.y
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            nx = dx / len
            ny = dy / len
          }
            
          const { GAME_CONFIG } = require('../config/gameConfig')
          const rawImpulse = damage * GAME_CONFIG.attackImpulseMultiplier
          const impulseMagnitude = Math.max(GAME_CONFIG.minImpulse, Math.min(rawImpulse, GAME_CONFIG.maxImpulse))
          
          const impulse = { x: nx * impulseMagnitude, y: ny * impulseMagnitude }

          // Emit battle damage produced event for knockback/FX (same as melee attacks)
          try {
            eventBus.emitRoomEvent(this.gameState.roomId, RoomEventType.BATTLE_DAMAGE_PRODUCED, {
              attacker,
              taker: target,
              impulse,
            })
          } catch {}
          
          if (targetDied) {
            console.log(`💀 PROJECTILE: ${projectile.id} killed ${target.id}`)
          } else {
            console.log(`⚔️ PROJECTILE: ${projectile.id} hit ${target.id} for ${damage} damage`)
          }
        }
    }
    
    // Track hit to prevent hitting the same target multiple times per swing
    projectile.hitTargets.add(target.id)
  }

  /**
   * Handle projectile collision with another projectile
   * Projectiles from different teams cancel each other out
   */
  handleProjectileCollision(projectileA: Projectile, projectileB: Projectile): void {
    // Check if either projectile is already "spent" (if not piercing)
    if (!projectileA.piercing && projectileA.hitTargets.size > 0) return
    if (!projectileB.piercing && projectileB.hitTargets.size > 0) return
    
    // Ignore if targets are on the same team
    if (projectileA.teamId && projectileB.teamId && projectileA.teamId === projectileB.teamId) return
    
    // Different teams: they clash and cancel each other out
    projectileA.hitTargets.add('clash')
    projectileB.hitTargets.add('clash')
    
    projectileA.stick()
    projectileB.stick()
    
    console.log(`💥 PROJECTILE CLASH: ${projectileA.id} vs ${projectileB.id}`)
  }

  /**
   * Handle projectile collision with boundary
   * Projectile sticks and despawns after lifetime
   */
  handleBoundaryCollision(projectile: Projectile): void {
    projectile.stick()
  }

  /**
   * Check if projectile can be deflected by attacker
   * Returns true if deflected, false otherwise
   */
  checkDeflection(projectile: Projectile, attacker: WorldLife): boolean {
    // Can't deflect if already deflected by someone
    if (projectile.deflectedBy) return false
    
    // Attacker must be attacking
    if (!attacker.isAttacking) return false
    
    // Check if projectile is in attack range (calculate distance directly)
    const dx = projectile.x - attacker.x
    const dy = projectile.y - attacker.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const effectiveRange = attacker.attackRange + (attacker as any).radius + projectile.radius
    if (distance > effectiveRange) return false
    
    // Check if projectile is in attack cone (configurable angle)
    const angleToProjectile = Math.atan2(dy, dx)
    const headingDiff = Math.abs(angleToProjectile - attacker.heading)
    const normalizedDiff = Math.min(headingDiff, 2 * Math.PI - headingDiff)
    const coneAngle = SPEAR_THROWER_STATS.deflectionConeAngle
    
    if (normalizedDiff > coneAngle) return false
    
    // Deflect: reverse velocity with configurable speed boost
    projectile.vx = -projectile.vx * SPEAR_THROWER_STATS.deflectionSpeedBoost
    projectile.vy = -projectile.vy * SPEAR_THROWER_STATS.deflectionSpeedBoost
    projectile.ownerId = attacker.id
    // Make the projectile belong to the deflecting actor's team going forward.
    // This prevents immediate "same-team" filtering issues and keeps collision rules consistent.
    ;(projectile as any).teamId = (attacker as any).teamId ?? projectile.teamId
    projectile.hitTargets.clear() // Can damage again after deflection
    projectile.deflectedBy = attacker.id

    // Reset travel and lifetime-related state so the deflected projectile
    // gets a fresh visible flight phase.
    projectile.distanceTraveled = 0
    projectile.isStuck = false
    projectile.stuckAt = 0

    // Ensure Colyseus marks the projectile as changed for replication.
    // (Some engines miss property-only changes on nested objects unless the map is touched.)
    this.gameState.projectiles.set(projectile.id, projectile)
    
    return true
  }
}

