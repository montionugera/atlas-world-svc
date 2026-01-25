import { type } from '@colyseus/schema'
import { WorldLife } from './WorldLife'
import { GameState } from './GameState'
import { Player } from './Player'
import { BattleManager } from '../modules/BattleManager'
import { eventBus, RoomEventType, BattleAttackData } from '../events/EventBus'
import { MOB_STATS } from '../config/combatConfig'
import { GAME_CONFIG } from '../config/gameConfig'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { IAgent } from '../ai/interfaces/IAgent'
import { AttackDefinition, calculateEffectiveAttackRange } from '../config/mobTypesConfig'
import { BehaviorState } from '../ai/behaviors/BehaviorState'
import { MobCombatSystem } from '../systems/MobCombatSystem'
// Removed global BattleManager singleton - now using room-scoped instances

export class Mob extends WorldLife implements IAgent {
  @type('string') tag: string = BehaviorState.IDLE // Current behavior tag for debugging/UI // Send radius to client
  @type('string') currentBehavior: BehaviorState = BehaviorState.IDLE
  @type('number') behaviorLockedUntil: number = 0 // epoch ms; 0 means unlocked
  @type('number') castDuration: number = 0 // Synced: duration of current cast/windup
  @type('boolean') isCasting: boolean = false // Synced: casting state for client animation
  @type('string') mobTypeId: string = '' // Mob type identifier (synced to clients for UI/debugging)
  @type('string') spawnAreaId: string = '' // ID of the area this mob was spawned from
  // Server-only fields (not synced to clients)
  mass: number = 1 // cached mass for steering calculations
  desiredVx: number = 0
  desiredVy: number = 0
  desiredBehavior: string = BehaviorState.IDLE
  decisionTimestamp: number = 0
  chaseRange: number = 15 // Chase range buffer (will be calculated with radius)
  currentAttackTarget: string = '' // ID of the player currently being attacked
  currentChaseTarget: string = '' // ID of the player currently being chased
  targetX: number = 0 // Current target position X
  targetY: number = 0 // Current target position Y
  wanderTargetX: number = 0 // Wander target position X
  wanderTargetY: number = 0 // Wander target position Y
  lastWanderTargetTime: number = 0 // When wander target was last set
  @type('number') maxMoveSpeed: number = 20 // synced to clients; mob movement cap
  
  // Attack strategy system (server-only)
  attackStrategies: AttackStrategy[] = []
  currentAttackStrategy: AttackStrategy | null = null
  castStartTime: number = 0
  baseWindDownTime: number = 1000 // Store default wind-down to reset after overrides
  
  // Rotation configuration
  @type('number') rotationSpeed: number = Math.PI // Rad/sec (default 180 deg/sec)
  
  // Attack Queue System
  attackQueue: { 
      executionTime: number; 
      attackDef: AttackDefinition; 
      strategy: AttackStrategy;
      targetId: string 
  }[] = []
  
  // Debug logging throttling (server-only)
  lastCooldownState: boolean = false // Track cooldown state to reduce log spam
  lastDebugLogTime: number = 0 // Throttle debug logs
  
  // Cleanup attributes (server-only)
  cantRespawn: boolean = false // Flag: this mob cannot be respawned
  readyToRemove: boolean = false // Flag: trigger immediate removal
  
  // Systems
  combatSystem: MobCombatSystem

  /**
   * Check if mob is ready to be permanently removed
   * @param respawnDelayMs - Respawn delay in milliseconds
   * @returns true if mob should be removed from game
   */
  readyToBeRemoved(respawnDelayMs: number): boolean {
    // Immediate removal trigger
    if (this.readyToRemove) return true
    
    // Check if enough time has passed since death (respawn delay)
    if (this.isAlive || this.diedAt === 0) return false
    return Date.now() - this.diedAt >= respawnDelayMs
  }

  /**
   * Check if mob can be respawned (for resurrection mechanics)
   * @returns true if mob is dead but can be respawned
   */
  canRespawn(): boolean {
    return !this.isAlive && !this.cantRespawn && this.diedAt > 0
  }

  /**
   * Mark mob for immediate removal (bypasses respawn delay)
   * Call this from game logic when special removal is needed
   */
  markForRemoval(): void {
    this.readyToRemove = true
  }

  /**
   * Clear removal flag (used when mob is respawned)
   */
  clearRemovalFlag(): void {
    this.readyToRemove = false
  }

  constructor(options: {
    id: string
    x: number
    y: number
    vx?: number
    vy?: number
    radius?: number
    attackRange?: number
    chaseRange?: number
    maxHealth?: number
    attackDamage?: number
    atkWindDownTime?: number
    defense?: number
    armor?: number
    density?: number
    maxMoveSpeed?: number
    attackStrategies?: AttackStrategy[]
    mobTypeId?: string
    spawnAreaId?: string
    rotationSpeed?: number
  }) {
    super({
      id: options.id,
      x: options.x,
      y: options.y,
      vx: options.vx ?? 0,
      vy: options.vy ?? 0,
      tags: ['mob'],
      radius: options.radius ?? MOB_STATS.radius,
      maxHealth: options.maxHealth ?? MOB_STATS.maxHealth,
      attackDamage: options.attackDamage ?? MOB_STATS.attackDamage,
      attackRange: options.attackRange ?? MOB_STATS.attackRange,
      attackDelay: (options.atkWindDownTime ?? MOB_STATS.atkWindDownTime), // Initial default, refined later
      defense: options.defense ?? MOB_STATS.defense,
      armor: options.armor ?? MOB_STATS.armor,
      density: options.density ?? MOB_STATS.density,
    })
    if (options.radius !== undefined) {
      this.radius = options.radius
    }
    if (options.chaseRange !== undefined) {
      this.chaseRange = options.chaseRange
    }
    if (options.maxMoveSpeed !== undefined) {
      this.maxMoveSpeed = options.maxMoveSpeed
    }
    
    // Set mob type ID
    if (options.mobTypeId !== undefined) {
      this.mobTypeId = options.mobTypeId
    }
    
    if (options.spawnAreaId !== undefined) {
      this.spawnAreaId = options.spawnAreaId
    }
    
    // Initialize attack strategies (default to melee if none provided)
    if (options.attackStrategies && options.attackStrategies.length > 0) {
      this.attackStrategies = options.attackStrategies
    } else {
      // Default: melee attack strategy (will be set up later if needed)
      this.attackStrategies = []
    }
    
    // Initialize base wind down from options or default
    this.baseWindDownTime = options.atkWindDownTime ?? MOB_STATS.atkWindDownTime


    if (options.rotationSpeed !== undefined) {
      this.rotationSpeed = options.rotationSpeed
    }

    // Initialize systems
    this.combatSystem = new MobCombatSystem(this)
  }

  // Override WorldLife update to include game logic
  update(
    deltaTime: number,
    gameState?: GameState
  ): { attacked: boolean; targetId?: string; messageCreated?: boolean; message?: any } {
    // Call parent update for health/invulnerability/status effects logic
    super.update(deltaTime)

    // Status Effect Check: If stunned, stop all movement and actions
    // Note: 'Freeze' is now a slow effect, so it doesn't stop action
    if (this.isStunned) {
        this.vx = 0
        this.vy = 0
        this.isMoving = false
        this.isCasting = false // Interrupt casting
        this.castDuration = 0
        
        // 🛑 FIX: Clear attack queue and reset attack state
        // This prevents attacks from firing immediately after stun ends
        if (this.attackQueue.length > 0) {
            this.attackQueue.length = 0 // Clear array
            this.currentAttackStrategy = null
            this.castStartTime = 0
        }
        
        return { attacked: false }
    }

    // Game logic: position, heading, and attack (if gameState provided)
    if (gameState) {
      // Update position logic and target tracking
      this.updateMobPosition(gameState.players)

      // Update heading based on current target
      this.updateHeadingToTarget(deltaTime)

      // Update attack logic and return result
      return this.updateAttack(gameState.players, gameState.roomId)
    }

    return { attacked: false }
  }

  /**
   * Apply behavior decision from AI module (state transition)
   * AI module decides, Mob applies - separation of concerns
   */
  applyBehaviorDecision(decision: {
    behavior: BehaviorState
    behaviorLockedUntil: number
    currentAttackTarget: string
    currentChaseTarget: string
    desiredVelocity?: { x: number; y: number }
  }): void {
    const oldBehavior = this.currentBehavior

    // 🔒 MOVEMENT LOCK: If casting, ignore AI behavior changes and stop movement
    // behaviorLockedUntil is usually for "committed" animations, but casting is a specialized state
    if (this.isCasting) {
        // Force zero velocity
        this.desiredVx = 0
        this.desiredVy = 0
        
        // Allow target updates if still in attack mode, but DO NOT switch behavior
        // If the decision tries to switch to 'chase', we ignore it to finish the cast.
        if (decision.behavior !== BehaviorState.ATTACK && this.currentBehavior === BehaviorState.ATTACK) {
             console.log(`🛡️ IGNORED behavior switch to ${decision.behavior} during CAST`)
             return 
        }
    }

    // Apply state transition
    this.currentBehavior = decision.behavior
    this.behaviorLockedUntil = decision.behaviorLockedUntil
    this.currentAttackTarget = decision.currentAttackTarget
    this.currentChaseTarget = decision.currentChaseTarget
    this.tag = this.currentBehavior

    // Apply desired velocity from decision
    // (If casting, we already zeroed it above, so we skip setting it from decision)
    if (!this.isCasting) {
        const speedMultiplier = this.getSpeedMultiplier()
        if (decision.desiredVelocity) {
          this.desiredVx = decision.desiredVelocity.x * speedMultiplier
          this.desiredVy = decision.desiredVelocity.y * speedMultiplier
        } else {
          this.desiredVx = 0
          this.desiredVy = 0
        }
    }

    // Log only when behavior actually changes
    if (oldBehavior !== this.currentBehavior) {
      console.log(`🔄 BEHAVIOR: ${this.id} ${oldBehavior} → ${this.currentBehavior.toUpperCase()}`)
    }
  }







  // Override boundary physics for mobs (bounce instead of clamp)
  applyBoundaryPhysics(width: number = 20, height: number = 20) {
    // Bounce off walls
    if (this.x <= 0 || this.x >= width) {
      this.vx = -this.vx
      this.x = Math.max(0, Math.min(width, this.x))
    }
    if (this.y <= 0 || this.y >= height) {
      this.vy = -this.vy
      this.y = Math.max(0, Math.min(height, this.y))
    }
  }

  // Update heading directly from target position
  updateHeadingToTarget(deltaTime: number): void {
    const dx = this.targetX - this.x
    const dy = this.targetY - this.y
    const magnitude = Math.hypot(dx, dy)
    
    // Valid target vector check
    if (magnitude <= 0.01) return

    const targetHeading = Math.atan2(dy, dx)
    
    // Calculate rotation speed based on state
    // Default: 100% speed
    let currentRotationSpeed = this.rotationSpeed
    
    // If attacking or casting, reduce to 10% speed
    if (this.isCasting || this.isAttacking) {
        currentRotationSpeed = this.rotationSpeed * 0.1
    }
    
    // Smooth rotation (interpolate towards target heading)
    // We use the shortest angle difference logic
    let diff = targetHeading - this.heading
    
    // Normalize difference to [-PI, PI] to rotate shortest way
    while (diff < -Math.PI) diff += Math.PI * 2
    while (diff > Math.PI) diff -= Math.PI * 2
    
    // Max rotation for this frame
    // deltaTime is in ms, convert to seconds
    const maxRotate = currentRotationSpeed * (deltaTime / 1000)

    // DEBUG: Log rotation
    // if (this.isCasting) {
    //    console.log(`Mob ${this.id} rot: speed=${currentRotationSpeed.toFixed(2)}, max=${maxRotate.toFixed(4)}, diff=${diff.toFixed(4)}`)
    // }
    
    if (Math.abs(diff) <= maxRotate) {
        // Close enough, snap to target
        this.heading = targetHeading
    } else {
        // Rotate towards target
        this.heading += Math.sign(diff) * maxRotate
        
        // Normalize heading to keep it clean (though likely handled elsewhere or not strictly needed if we just use cos/sin)
        // But good practice to keep in [-PI, PI] or [0, 2PI]
        if (this.heading > Math.PI) this.heading -= Math.PI * 2
        else if (this.heading < -Math.PI) this.heading += Math.PI * 2
    }
  }

  // Update position logic - handles movement, target tracking, and heading updates
  updateMobPosition(players: Map<string, any>): {
    moved: boolean
    targetX?: number
    targetY?: number
  } {
    // Update target positions for heading calculation based on current behavior
    if (this.currentBehavior === BehaviorState.ATTACK && this.currentAttackTarget) {
      const attackTarget = players.get(this.currentAttackTarget)
      if (attackTarget && attackTarget.isAlive) {
        this.targetX = attackTarget.x
        this.targetY = attackTarget.y
        return { moved: true, targetX: this.targetX, targetY: this.targetY }
      }
    } else if (this.currentBehavior === BehaviorState.CHASE && this.currentChaseTarget) {
      const chaseTarget = players.get(this.currentChaseTarget)
      if (chaseTarget && chaseTarget.isAlive) {
        this.targetX = chaseTarget.x
        this.targetY = chaseTarget.y
        return { moved: true, targetX: this.targetX, targetY: this.targetY }
      }
    } else if (this.currentBehavior === BehaviorState.WANDER) {
      // Wander behavior: use wander target
      this.targetX = this.wanderTargetX
      this.targetY = this.wanderTargetY
      return { moved: true, targetX: this.targetX, targetY: this.targetY }
    }

    return { moved: false }
  }

  // Update attack logic - uses attack strategies if available, otherwise falls back to legacy behavior
  updateAttack(
    players: Map<string, any>,
    roomId?: string
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } {
    return this.combatSystem.update(GAME_CONFIG.tickRate, players, roomId || '')
  }




  // Add attacks to the timeline
  public enqueueAttacks(
      strategy: AttackStrategy, 
      targetId: string, 
      attacks: AttackDefinition[], 
      startTime: number
  ): void {
      this.combatSystem.enqueueAttacks(strategy, targetId, attacks, startTime)
  }




}
