/**
 * WorldLife - Base class for living entities in the world
 * Represents entities that can move, have health, and can attack
 */

import { Schema, type, ArraySchema } from '@colyseus/schema'
import { WorldObject } from './WorldObject'

export abstract class WorldLife extends WorldObject {
  // Physical properties
  @type('number') radius: number = 4

  // Health system
  @type('number') maxHealth: number = 100
  @type('number') currentHealth: number = 100
  @type('boolean') isAlive: boolean = true

  // Attack system
  @type('number') attackDamage: number = 10
  @type('number') attackRange: number = 5
  @type('number') attackDelay: number = 1000 // milliseconds between attacks
  @type('number') lastAttackTime: number = 0

  // Defense system
  @type('number') defense: number = 0 // Reduces incoming damage
  @type('number') armor: number = 0 // Additional damage reduction

// Impulse system (calculated from damage)
  @type('number') density: number = 1 // Material density for mass calculation

  // Movement and combat state
  @type('boolean') isAttacking: boolean = false
  @type('boolean') isMoving: boolean = false
  @type('string') lastAttackedTarget: string = ''

  // Heading direction (in radians) - based on latest movement
  @type('number') heading: number = 0

  // Status Effects
  @type('boolean') isFrozen: boolean = false
  @type('number') freezeDuration: number = 0
  @type('boolean') isStunned: boolean = false
  @type('number') stunDuration: number = 0

  // Server-only properties (not synced to clients)
  attackCooldown: number = 0
  isInvulnerable: boolean = false
  invulnerabilityDuration: number = 0
  diedAt: number = 0 // Timestamp when entity died (0 = alive or not set)
  attackAnimationStartTime: number = 0 // Timestamp when attack animation started (0 = not attacking)

  // Calculate mass from radius and density (mass = volume * density)
  getMass(): number {
    // Volume of sphere = (4/3) * π * r³
    const volume = (4 / 3) * Math.PI * Math.pow(this.radius, 3)
    return volume * this.density
  }

  // Calculate attack impulse from damage
  getAttackImpulse(): number {
    const { GAME_CONFIG } = require('../config/gameConfig')
    const impulse = this.attackDamage * GAME_CONFIG.attackImpulseMultiplier
    return Math.max(GAME_CONFIG.minImpulse, Math.min(impulse, GAME_CONFIG.maxImpulse))
  }

  // Calculate recoil impulse from damage
  getRecoilImpulse(): number {
    const { GAME_CONFIG } = require('../config/gameConfig')
    const impulse = this.attackDamage * GAME_CONFIG.recoilImpulseMultiplier
    return Math.max(GAME_CONFIG.minImpulse, Math.min(impulse, GAME_CONFIG.maxImpulse))
  }

  constructor(options: {
    id: string
    x: number
    y: number
    vx?: number
    vy?: number
    tags?: string[]
    radius?: number
    maxHealth?: number
    attackDamage?: number
    attackRange?: number
    attackDelay?: number
    defense?: number
    armor?: number
    density?: number
  }) {
    const opts = options
    super(opts.id, opts.x, opts.y, opts.vx ?? 0, opts.vy ?? 0, opts.tags ?? [])
    this.radius = opts.radius ?? 4
    this.maxHealth = opts.maxHealth ?? 100
    this.currentHealth = this.maxHealth
    this.attackDamage = opts.attackDamage ?? 10
    this.attackRange = opts.attackRange ?? 5
    this.attackDelay = opts.attackDelay ?? 1000
    this.defense = opts.defense ?? 0
    this.armor = opts.armor ?? 0
    this.density = opts.density ?? 1
    this.lastAttackTime = performance.now() - this.attackDelay - 1 // Allow immediate first attack
  }

  // Health management - simple health setter
  // NOTE: Defense calculations and invulnerability are handled by BattleModule.applyDamage()
  // This method is kept for internal use only. All external damage should go through BattleModule.
  takeDamage(damage: number, attacker?: WorldLife): boolean {
    if (!this.isAlive || this.isInvulnerable) return false

    // Simple health reduction (defense calculation should be done by BattleModule before calling this)
    this.currentHealth = Math.max(0, this.currentHealth - damage)

    if (this.currentHealth <= 0) {
      this.die()
      return true // Entity died
    }

    return false // Entity survived
  }

  heal(amount: number): boolean {
    if (!this.isAlive) return false

    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount)
    return true
  }

  die(): void {
    this.isAlive = false
    this.currentHealth = 0
    this.isAttacking = false
    this.attackAnimationStartTime = 0 // Reset animation timestamp
    this.isMoving = false
    this.vx = 0
    this.vy = 0
    this.diedAt = Date.now() // Record death timestamp for respawn delay
    // Clear status effects
    this.isFrozen = false
    this.freezeDuration = 0
    this.isStunned = false
    this.stunDuration = 0
  }

  respawn(x?: number, y?: number): void {
    this.isAlive = true
    this.currentHealth = this.maxHealth
    this.isAttacking = false
    this.attackAnimationStartTime = 0 // Reset animation timestamp
    this.isMoving = false
    this.vx = 0
    this.vy = 0
    this.lastAttackTime = 0
    this.attackCooldown = 0
    this.isInvulnerable = false
    this.invulnerabilityDuration = 0
    this.diedAt = 0 // Reset death timestamp
    // Clear status effects
    this.isFrozen = false
    this.freezeDuration = 0
    this.isStunned = false
    this.stunDuration = 0
    
    // Note: Mob-specific flags (cantRespawn, readyToRemove) are handled in Mob class
    // Mob class should override respawn() to call clearRemovalFlag()

    if (x !== undefined && y !== undefined) {
      this.x = x
      this.y = y
    }
  }

  // Deprecated: Use Mob.readyToBeRemoved() instead
  // Kept for backward compatibility
  canBeRemoved(respawnDelayMs: number): boolean {
    if (this.isAlive || this.diedAt === 0) return false
    return Date.now() - this.diedAt >= respawnDelayMs
  }

  // Attack system with anti-spam protection
  canAttack(): boolean {
    if (!this.isAlive) return false
    // Cannot attack if frozen or stunned
    if (this.isFrozen || this.isStunned) return false

    const now = performance.now()
    const timeSinceLastAttack = now - this.lastAttackTime

    return timeSinceLastAttack >= this.attackDelay
  }


  // Utility methods
  getDistanceTo(other: WorldLife): number {
    const dx = this.x - other.x
    const dy = this.y - other.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  getHealthPercentage(): number {
    return this.maxHealth > 0 ? (this.currentHealth / this.maxHealth) * 100 : 0
  }

  isInRange(target: WorldLife): boolean {
    return this.getDistanceTo(target) <= this.attackRange
  }

  // Invulnerability system
  // Duration is managed by update() loop - no setTimeout needed
  triggerInvulnerability(duration: number): void {
    this.isInvulnerable = true
    this.invulnerabilityDuration = duration
  }

  // Smart heading update - automatically chooses best source
  updateHeading(vx?: number, vy?: number): void {
    let sourceVx: number, sourceVy: number, threshold: number

    if (vx !== undefined && vy !== undefined) {
      // Use provided direction (e.g., target direction)
      sourceVx = vx
      sourceVy = vy
      threshold = 0.1 // Higher threshold for explicit directions
    } else {
      // Use AI desired direction (for mobs) or actual velocity (for players)
      if ('desiredVx' in this && 'desiredVy' in this) {
        // Mob: use AI desired direction
        sourceVx = (this as any).desiredVx
        sourceVy = (this as any).desiredVy
      } else {
        // Player: use actual velocity
        sourceVx = this.vx
        sourceVy = this.vy
      }
      threshold = 0.01 // Lower threshold for AI intent
    }

    const magnitude = Math.hypot(sourceVx, sourceVy)
    if (magnitude > threshold) {
      this.heading = Math.atan2(sourceVy, sourceVx)
    }
  }

  // Update method for server-side logic
  update(deltaTime: number): void {
    // Update invulnerability
    if (this.isInvulnerable && this.invulnerabilityDuration > 0) {
      this.invulnerabilityDuration -= deltaTime
      if (this.invulnerabilityDuration <= 0) {
        this.isInvulnerable = false
        this.invulnerabilityDuration = 0
      }
    }

    // Update Status Effects
    if (this.isFrozen) {
        this.freezeDuration -= deltaTime
        if (this.freezeDuration <= 0) {
            this.isFrozen = false
            this.freezeDuration = 0
            console.log(`❄️ THAW: ${this.id} is no longer frozen`)
        }
    }

    if (this.isStunned) {
        this.stunDuration -= deltaTime
        if (this.stunDuration <= 0) {
            this.isStunned = false
            this.stunDuration = 0
            console.log(`💫 RECOVER: ${this.id} is no longer stunned`)
        }
    }

    // Update attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime
    }

    // Update attack animation state (200ms duration)
    if (this.isAttacking && this.attackAnimationStartTime > 0) {
      const animationElapsedMs = performance.now() - this.attackAnimationStartTime
      if (animationElapsedMs >= 200) {
        this.isAttacking = false
        this.attackAnimationStartTime = 0
      }
    }

    // Update movement state and heading
    // If frozen or stunned, force moving to false
    if (this.isFrozen || this.isStunned) {
        this.isMoving = false
        // Note: Velocity should be zeroed in specific update loops (Mob/Player)
    } else {
        this.isMoving = Math.hypot(this.vx, this.vy) > 0
    }

    // Use appropriate heading update method
    if ('updateHeadingToTarget' in this) {
      // Mob: use target-based heading
      ;(this as any).updateHeadingToTarget()
    } else if ('updateHeadingFromInput' in this) {
      // Player: use input-based heading
      ;(this as any).updateHeadingFromInput()
    } else {
      // Fallback: use velocity-based heading
      this.updateHeading()
    }
  }

  // Override applyBoundaryPhysics for living entities
  applyBoundaryPhysics(width: number = 400, height: number = 300): void {
    // Living entities bounce off boundaries instead of clamping
    if (this.x <= 0 || this.x >= width) {
      this.vx = -this.vx * 0.8 // Bounce with some energy loss
      this.x = Math.max(0, Math.min(width, this.x))
    }
    if (this.y <= 0 || this.y >= height) {
      this.vy = -this.vy * 0.8 // Bounce with some energy loss
      this.y = Math.max(0, Math.min(height, this.y))
    }
  }
}
