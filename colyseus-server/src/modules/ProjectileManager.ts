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
    mob: Mob, 
    targetX: number, 
    targetY: number, 
    damage: number,
    maxRange: number = MELEE_PROJECTILE_STATS.meleeMaxRange,
    radius: number = MELEE_PROJECTILE_STATS.projectileRadius,
    speed: number = MELEE_PROJECTILE_STATS.meleeSpeed
  ): Projectile {
    const dx = targetX - mob.x
    const dy = targetY - mob.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Calculate angle to target
    const angle = Math.atan2(dy, dx)
    
    // Calculate initial velocity components
    const vx = speed * Math.cos(angle)
    const vy = speed * Math.sin(angle)

    // Spawn at edge of mob + small offset
    const spawnOffset = (mob.radius || 1) + 0.5
    const spawnX = mob.x + Math.cos(angle) * spawnOffset
    const spawnY = mob.y + Math.sin(angle) * spawnOffset
    
    // Create projectile with melee stats
    const projectileId = `projectile-melee-${this.gameState.tick}-${Math.random().toString(36).slice(2, 4)}`
    const projectile = new Projectile(
      projectileId,
      spawnX,
      spawnY,
      vx,
      vy,
      mob.id,
      damage,
      'melee', // type
      maxRange,
      radius,
      MELEE_PROJECTILE_STATS.projectileLifetime
    )
    
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
      SPEAR_THROWER_STATS.projectileLifetime
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
   * Handle projectile collision with player
   * Projectiles pierce through (don't stop), but only damage once per target
   */
  handlePlayerCollision(projectile: Projectile, player: Player): void {
    if (projectile.hasHit) return // Already hit this target
    
    const attacker = this.gameState.mobs.get(projectile.ownerId)
    
    // Route damage through BattleManager queue if available (throttled)
    if (this.battleManager) {
        // Create attack message
        const message = BattleManager.createAttackMessage(
            projectile.ownerId,
            player.id,
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
        
        console.log(`📨 PROJECTILE: Queuing hit ${projectile.id} on ${player.id}`)
        this.battleManager.addActionMessage(message)
        
    } else {
        // Fallback: Apply damage directly via BattleModule (legacy/unthrottled)
        if (attacker && attacker.isAlive) {
          // Use BattleModule to apply damage
          const damage = this.battleModule.calculateDamage(
            { attackDamage: projectile.damage } as WorldLife,
            player
          )
          const targetDied = this.battleModule.applyDamage(player, damage, { eventId: projectile.id })
          
          // Calculate impulse vector from projectile velocity
          const vx = projectile.vx
          const vy = projectile.vy
          const speed = Math.sqrt(vx * vx + vy * vy) || 1
          const nx = vx / speed
          const ny = vy / speed
            
          const { GAME_CONFIG } = require('../config/gameConfig')
          const rawImpulse = damage * GAME_CONFIG.attackImpulseMultiplier
          const impulseMagnitude = Math.max(GAME_CONFIG.minImpulse, Math.min(rawImpulse, GAME_CONFIG.maxImpulse))
          
          const impulse = { x: nx * impulseMagnitude, y: ny * impulseMagnitude }

          // Emit battle damage produced event for knockback/FX (same as melee attacks)
          try {
            eventBus.emitRoomEvent(this.gameState.roomId, RoomEventType.BATTLE_DAMAGE_PRODUCED, {
              attacker,
              taker: player,
              impulse,
            })
          } catch {}
          
          if (targetDied) {
            console.log(`💀 PROJECTILE: ${projectile.id} killed ${player.id}`)
          } else {
            console.log(`⚔️ PROJECTILE: ${projectile.id} hit ${player.id} for ${damage} damage`)
          }
        }
    }
    
    // Mark as hit (pierces through, but won't damage again)
    projectile.hasHit = true
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
    projectile.hasHit = false // Can damage again after deflection
    projectile.deflectedBy = attacker.id
    
    return true
  }
}

