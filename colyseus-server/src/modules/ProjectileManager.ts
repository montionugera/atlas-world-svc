import { Projectile } from '../schemas/Projectile'
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { WorldLife } from '../schemas/WorldLife'
import { BattleModule } from './BattleModule'
import { GameState } from '../schemas/GameState'
import { SPEAR_THROWER_STATS, MELEE_PROJECTILE_STATS } from '../config/combatConfig'
import { PROJECTILE_GRAVITY } from '../config/physicsConfig'
import { eventBus, RoomEventType } from '../events/EventBus'

export class ProjectileManager {
  private gameState: GameState
  private battleModule: BattleModule
  private gravity: number = PROJECTILE_GRAVITY
  private maxSpeed: number = SPEAR_THROWER_STATS.spearSpeed

  constructor(gameState: GameState, battleModule: BattleModule) {
    this.gameState = gameState
    this.battleModule = battleModule
  }

  /**
   * Create a melee projectile from mob to target
   * Short range, fast speed for near-instant hits
   */
  createMelee(mob: Mob, targetX: number, targetY: number, damage: number): Projectile {
    const dx = targetX - mob.x
    const dy = targetY - mob.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Calculate angle to target
    const angle = Math.atan2(dy, dx)
    
    // Use melee projectile speed (very fast for near-instant hit)
    const speed = MELEE_PROJECTILE_STATS.meleeSpeed
    
    // Calculate initial velocity components
    const vx = speed * Math.cos(angle)
    const vy = speed * Math.sin(angle)
    
    // Create projectile with melee stats
    const projectileId = `projectile-melee-${this.gameState.tick}-${Math.random().toString(36).slice(2, 4)}`
    const projectile = new Projectile(
      projectileId,
      mob.x,
      mob.y,
      vx,
      vy,
      mob.id,
      damage,
      MELEE_PROJECTILE_STATS.meleeMaxRange,
      MELEE_PROJECTILE_STATS.projectileRadius,
      MELEE_PROJECTILE_STATS.projectileLifetime
    )
    
    return projectile
  }

  /**
   * Create a spear projectile from mob to target
   * Calculates trajectory based on configurable physics
   */
  createSpear(mob: Mob, targetX: number, targetY: number, damage: number, maxRange: number = SPEAR_THROWER_STATS.spearMaxRange): Projectile {
    const dx = targetX - mob.x
    const dy = targetY - mob.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Calculate angle to target
    const angle = Math.atan2(dy, dx)
    
    // Use configurable max speed
    const maxSpeed = this.maxSpeed
    
    // Calculate initial velocity components
    const vx = maxSpeed * Math.cos(angle)
    const vy = maxSpeed * Math.sin(angle)
    
    // Create projectile with configurable radius
    const projectileId = `projectile-${this.gameState.tick}-${Math.random().toString(36).slice(2, 4)}`
    const projectile = new Projectile(
      projectileId,
      mob.x,
      mob.y,
      vx,
      vy,
      mob.id,
      damage,
      maxRange,
      SPEAR_THROWER_STATS.projectileRadius,
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
    
    // Apply damage directly via BattleModule
    const attacker = this.gameState.mobs.get(projectile.ownerId)
    if (attacker && attacker.isAlive) {
      // Use BattleModule to apply damage
      const damage = this.battleModule.calculateDamage(
        { attackDamage: projectile.damage } as WorldLife,
        player
      )
      const targetDied = this.battleModule.applyDamage(player, damage, { eventId: projectile.id })
      
      // Emit battle damage produced event for knockback/FX (same as melee attacks)
      try {
        eventBus.emitRoomEvent(this.gameState.roomId, RoomEventType.BATTLE_DAMAGE_PRODUCED, {
          attacker,
          taker: player,
        })
      } catch {}
      
      if (targetDied) {
        console.log(`💀 PROJECTILE: ${projectile.id} killed ${player.id}`)
      } else {
        console.log(`⚔️ PROJECTILE: ${projectile.id} hit ${player.id} for ${damage} damage`)
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

