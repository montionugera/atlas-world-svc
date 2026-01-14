import { type } from '@colyseus/schema'
import { WorldLife } from './WorldLife'
import { GameState } from './GameState'
import { Player } from './Player'
import { BattleManager } from '../modules/BattleManager'
import { eventBus, RoomEventType, BattleAttackData } from '../events/EventBus'
import { MOB_STATS } from '../config/combatConfig'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { IAgent } from '../ai/interfaces/IAgent'
import { AttackDefinition, calculateEffectiveAttackRange } from '../config/mobTypesConfig'
import { BehaviorState } from '../ai/behaviors/BehaviorState'
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

  /**
   * Check if mob is ready to be permanently removed
   * @param respawnDelayMs - Respawn delay in milliseconds
   * @returns true if mob should be removed from game
   */
  readyToBeRemoved(respawnDelayMs: number): boolean {
    // Immediate removal trigger
    if (this.readyToRemove) return true
    
    
    return false
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

  // Helper: Calculate movement direction toward target
  private calculateDirectionToTarget(target: { x: number; y: number }): { x: number; y: number } {
    const dx = target.x - this.x
    const dy = target.y - this.y
    const distance = Math.hypot(dx, dy) || 1
    return { x: dx / distance, y: dy / distance }
  }

  // Helper: Calculate movement direction away from target
  private calculateDirectionAwayFromTarget(target: { x: number; y: number }): { x: number; y: number } {
    const dx = this.x - target.x
    const dy = this.y - target.y
    const distance = Math.hypot(dx, dy) || 1
    return { x: dx / distance, y: dy / distance }
  }

  // Compute steering impulse to move current physics velocity toward desired velocity
  // Returns an impulse vector already scaled by mass and clamped
  computeSteeringImpulse(params: {
    currentVelocity: { x: number; y: number }
    desiredVelocity: { x: number; y: number }
    mass: number
    gain?: number // tuning factor for responsiveness
    maxImpulsePerTick?: number // safety clamp
  }): { x: number; y: number } {
    const { currentVelocity, desiredVelocity, mass } = params
    const gain = params.gain ?? 0.2
    const maxImpulse = params.maxImpulsePerTick ?? mass * 1.0
    const steerX = desiredVelocity.x - currentVelocity.x
    const steerY = desiredVelocity.y - currentVelocity.y
    let impulseX = steerX * mass * gain
    let impulseY = steerY * mass * gain
    const mag = Math.hypot(impulseX, impulseY)
    if (mag > maxImpulse) {
      const s = maxImpulse / (mag || 1)
      impulseX *= s
      impulseY *= s
    }
    return { x: impulseX, y: impulseY }
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
    // Only process attacks if we're in attack behavior
    if (this.currentBehavior !== BehaviorState.ATTACK || !this.currentAttackTarget) {
      return { attacked: false }
    }

    const targetPlayer = players.get(this.currentAttackTarget)
    if (!targetPlayer || !targetPlayer.isAlive) {
      // Target is dead or doesn't exist, clear attack target
      this.currentAttackTarget = ''
      this.currentBehavior = BehaviorState.WANDER // Fallback to wander
      this.isCasting = false
      this.castDuration = 0
      this.castStartTime = 0
      return { attacked: false }
    }

    // Update target position for heading calculation
    this.targetX = targetPlayer.x
    this.targetY = targetPlayer.y

    // Use attack strategies if available
    if (this.attackStrategies.length > 0) {
      return this.updateAttackWithStrategies(targetPlayer, roomId || '', players)
    }

    // Legacy behavior: melee attack (for backward compatibility)
    if (!this.canAttack()) {
      return { attacked: false }
    }

    const distanceToTargetPlayer = this.getDistanceTo(targetPlayer)
    const effectiveMeleeRange = this.attackRange + this.radius + targetPlayer.radius
    if (distanceToTargetPlayer > effectiveMeleeRange) {
      // Target moved out of range, switch to chase behavior
      console.log(
        `🎯 MOB ${this.id}: Target out of range (${distanceToTargetPlayer.toFixed(2)} > ${effectiveMeleeRange.toFixed(2)}), switching to chase`
      )
      this.currentBehavior = BehaviorState.CHASE
      this.currentChaseTarget = this.currentAttackTarget
      this.currentAttackTarget = ''
      return { attacked: false }
    }

    // Emit attack event - let BattleManager handle all battle logic
    const attackData: BattleAttackData = {
      actorId: this.id,
      targetId: targetPlayer.id,
      damage: this.attackDamage,
      range: this.attackRange,
      roomId: roomId || ''
    }

    // Emit the battle attack event
    eventBus.emitRoomEvent(roomId || '', RoomEventType.BATTLE_ATTACK, attackData)
    console.log(
      `📡 MOB ${this.id} emitted battle attack event for ${targetPlayer.id}`
    )

    return { attacked: true, targetId: targetPlayer.id, eventEmitted: true }
  }

  // Helper: Calculate melee effective range (includes mob and target radii)
  private calculateMeleeRange(target: Player): number {
    return this.attackRange + this.radius + target.radius
  }

  // Helper: Get strategy's effective range
  private getStrategyRange(strategy: AttackStrategy, target: Player): number {
    if (strategy.name === 'melee') {
      return this.calculateMeleeRange(target)
    }
    return (strategy as any).maxRange || this.attackRange
  }

  // Helper: Sort strategies by priority (melee first, then by range)
  private sortStrategiesByPriority(strategies: AttackStrategy[], target: Player): AttackStrategy[] {
    return [...strategies].sort((a, b) => {
      // Instant attacks (0 cast time) have priority
      const aIsInstant = a.getCastTime() === 0
      const bIsInstant = b.getCastTime() === 0
      if (aIsInstant && !bIsInstant) return -1
      if (!aIsInstant && bIsInstant) return 1
      
      // If same cast time, prefer shorter range (melee typically shorter)
      const aRange = this.getStrategyRange(a, target)
      const bRange = this.getStrategyRange(b, target)
      return aRange - bRange
    })
  }

  // Helper: Handle casting phase completion
  private handleCastingComplete(
    targetPlayer: Player,
    roomId: string,
    currentTimeMs: number
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } | null {
    if (!this.currentAttackStrategy) return null

    console.log(`🎯 DEBUG: ${this.id} casting complete, executing ${this.currentAttackStrategy.name} attack`)
    const attackExecuted = this.currentAttackStrategy.execute(this, targetPlayer, roomId)
    
    if (attackExecuted) {
      this.isCasting = false
      this.castDuration = 0
      this.castStartTime = 0
      this.currentAttackStrategy = null
      this.lastAttackTime = performance.now()
      this.isAttacking = true
      this.attackAnimationStartTime = performance.now()
      return { attacked: true, targetId: targetPlayer.id, eventEmitted: true }
    } else {
      console.log(`❌ DEBUG: ${this.id} strategy.execute() returned false`)
      this.isCasting = false
      this.castDuration = 0
      this.castStartTime = 0
      this.currentAttackStrategy = null
      return null
    }
  }

  // Helper: Check if casting is complete
  private checkCastingPhase(
    targetPlayer: Player,
    roomId: string
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } | null {
    if (!this.isCasting || this.castStartTime === 0) return null

    const currentTimeMs = Date.now()
    const castDurationMs = this.currentAttackStrategy?.getCastTime() || 0
    const castElapsedMs = currentTimeMs - this.castStartTime

    if (castElapsedMs >= castDurationMs) {
      return this.handleCastingComplete(targetPlayer, roomId, currentTimeMs)
    }

    // Still casting
    return { attacked: false }
  }

  // State transition: Start casting for a strategy
  public startCasting(strategy: AttackStrategy, currentTimeMs: number): void {
    const castTime = strategy.getCastTime()
    console.log(`⏳ DEBUG: ${this.id} starting casting for ${strategy.name} (${castTime}ms)`)
    this.isCasting = true
    this.castDuration = castTime
    this.isAttacking = false // Cancel any previous attack animation (combo flow)
    this.castStartTime = currentTimeMs
    this.currentAttackStrategy = strategy
  }

  // State transition: Start attacking (instant attack executed)
  private startAttacking(targetId?: string, currentTimeMs?: number): void {
    console.log(`⚡ DEBUG: ${this.id} executing instant attack`)
    this.isAttacking = true
    this.attackAnimationStartTime = performance.now()
    this.lastAttackTime = performance.now() // Update cooldown timer for instant attacks
    this.lastCooldownState = false
    if (currentTimeMs !== undefined) {
      this.lastDebugLogTime = currentTimeMs
    }
  }

  // Add attacks to the timeline
  public enqueueAttacks(
      strategy: AttackStrategy, 
      targetId: string, 
      attacks: AttackDefinition[], 
      startTime: number
  ): void {
      this.attackQueue = [] // Clear existing queue (new combo overrides old)
      let currentTime = startTime

      attacks.forEach((attack, index) => {
          // Calculate when this attack should actually fire (end of its cast)
          const fireTime = currentTime + attack.atkWindUpTime
          
          this.attackQueue.push({
              executionTime: fireTime,
              attackDef: attack,
              strategy: strategy,
              targetId: targetId
          })

          // Next attack starts after this one finishes (fireTime becomes start of next cast)
          // (assuming sequential casting. If there are delays, they should be in castingTimeInMs of the *next* attack or separate delay)
          // For now, based on DoubleAttack, the delay IS the cast time of the second attack.
          currentTime = fireTime
      })

      // Set initial casting state if we have a queue
      if (this.attackQueue.length > 0) {
          const firstAttack = this.attackQueue[0]
          // If the first attack is in the future, we are casting
          if (firstAttack.executionTime > Date.now()) {
             this.isCasting = true
             this.castDuration = firstAttack.attackDef.atkWindUpTime || 0
             this.castStartTime = Date.now()
             this.currentAttackStrategy = strategy
             this.isAttacking = false
          }
      }
  }

  // Process the attack queue
  private processAttackQueue(players: Map<string, any>, roomId: string): { attacked: boolean; targetId?: string; eventEmitted?: boolean } | null {
      if (this.attackQueue.length === 0) return null

      const now = Date.now()
      const nextAttack = this.attackQueue[0] // Peek

      // Check if it's time to fire
      if (now >= nextAttack.executionTime) {
          // Dequeue
          this.attackQueue.shift()
          
          const targetPlayer = players.get(nextAttack.targetId) as Player
          if (targetPlayer /* && targetPlayer.isAlive */) { 
               // Execute
               if (typeof (nextAttack.strategy as any).performAttack === 'function') {
                   (nextAttack.strategy as any).performAttack(this, targetPlayer, nextAttack.attackDef)
               } else {
                   console.warn(`⚠️ Mob ${this.id}: Strategy ${nextAttack.strategy.name} does not support queued execution via performAttack`)
               }

               this.lastAttackTime = performance.now()
               this.isAttacking = true
               this.attackAnimationStartTime = performance.now()

               // Update attack delay for the NEXT attack cycle based on this attack's cooldown
               // If cooldown is defined, use it directly (it's the full cycle time)
               // Otherwise, calculate Total Delay = WindUp + WindDown
               if (nextAttack.attackDef.cooldown !== undefined) {
                   this.attackDelay = nextAttack.attackDef.cooldown
               } else {
                   const windUp = nextAttack.attackDef.atkWindUpTime || 0
                   this.attackDelay = windUp + this.baseWindDownTime
               }
          }

          // Update State for NEXT attack
          if (this.attackQueue.length > 0) {
              // Still have attacks pending
              this.isCasting = true
              this.castStartTime = now // Start casting the next one
              this.castDuration = this.attackQueue[0].attackDef.atkWindUpTime || 0
          } else {
              // Queue empty
              this.isCasting = false
              this.castDuration = 0
              this.currentAttackStrategy = null
          }

          return { attacked: true, targetId: nextAttack.targetId, eventEmitted: true }
      } else {
          // Waiting for attack time
          this.isCasting = true // Ensure casting is true while waiting
          return { attacked: false }
      }
  }

  // Helper: Check if target is out of attack range
  private checkTargetOutOfRange(targetPlayer: Player): boolean {
    // If we are currently casting, DO NOT check range or switch behavior
    // We want the cast to finish regardless of where the target moves
    if (this.isCasting) return false

    const distance = this.getDistanceTo(targetPlayer)
    const maxRange = Math.max(
      ...this.attackStrategies.map(s => this.getStrategyRange(s, targetPlayer))
    )
    
    if (distance > maxRange) {
      console.log(`🎯 DEBUG: ${this.id} target out of range (${distance.toFixed(2)} > ${maxRange.toFixed(2)}), switching to chase`)
      this.currentBehavior = BehaviorState.CHASE
      this.currentChaseTarget = this.currentAttackTarget
      this.currentAttackTarget = ''
      this.isCasting = false
      this.castDuration = 0
      this.castStartTime = 0
      this.lastCooldownState = false
      return true
    }
    return false
  }

  // Update attack using attack strategies
  private updateAttackWithStrategies(
    targetPlayer: Player,
    roomId: string,
    players: Map<string, any>
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } {
    const currentTimeMs = Date.now()
    const currentTimePerf = performance.now()

    // 1. Process Attack Queue (High Priority)
    const queueResult = this.processAttackQueue(players, roomId)
    if (queueResult !== null) {
        // If queue returns a result (attacked OR waiting), we respect it.
        // If it returns {attacked: false} it means we are "casting/waiting" for queue.
        return queueResult
    }

    // Check casting phase first (Legacy/Fallback for non-queue strategies)
    // If I use queue for everything eventually, this can go.
    // For now, keep it for other strategies not using queue yet.
    const castingResult = this.checkCastingPhase(targetPlayer, roomId)
    if (castingResult !== null) {
      return castingResult
    }

    // Sort strategies by priority
    const strategiesByPriority = this.sortStrategiesByPriority(this.attackStrategies, targetPlayer)
    
    // Check cooldown and prepare debug logging
    const isCooldownReady = this.canAttack()
    const cooldownStateChanged = isCooldownReady !== this.lastCooldownState
    const shouldLogDebug = cooldownStateChanged && isCooldownReady
    
    if (shouldLogDebug) {
      const cooldownElapsed = currentTimePerf - this.lastAttackTime
      const distance = this.getDistanceTo(targetPlayer)
      console.log(`🔍 DEBUG: ${this.id} cooldown ready, checking ${strategiesByPriority.length} strategies`)
      console.log(`  📊 Cooldown: elapsed=${cooldownElapsed.toFixed(0)}ms, delay=${this.attackDelay}ms`)
      console.log(`  📏 Distance: ${distance.toFixed(2)} units to target`)
      this.lastCooldownState = isCooldownReady
    }
    
    // Try each strategy in priority order
    for (const strategy of strategiesByPriority) {
      const result = strategy.attemptExecute(this, targetPlayer, roomId)
      
      if (!result.canExecute) {
        continue // Try next strategy
      }

      // Log strategy details if debug logging is enabled
      if (shouldLogDebug) {
        const distance = this.getDistanceTo(targetPlayer)
        const range = this.getStrategyRange(strategy, targetPlayer)
        const castTime = strategy.getCastTime()
        console.log(`  🔍 Strategy "${strategy.name}": canExecute=true, distance=${distance.toFixed(2)}, effectiveRange=${range.toFixed(2)}, castTime=${castTime}ms`)
      }

      // Apply state transitions based on strategy result
      if (result.needsCasting) {
        this.startCasting(strategy, currentTimeMs)
        return { attacked: false }
      } else if (result.executed) {
        this.startAttacking(result.targetId, currentTimeMs)
        return { attacked: true, targetId: result.targetId, eventEmitted: true }
      } else {
        // Strategy can execute but didn't (shouldn't happen, but handle gracefully)
        console.log(`❌ DEBUG: ${this.id} ${strategy.name}.attemptExecute() returned canExecute=true but executed=false`)
        return { attacked: false }
      }
    }

    // No strategy can execute - check if target out of range
    if (this.checkTargetOutOfRange(targetPlayer)) {
      return { attacked: false }
    }

    // Target in range but no strategy can execute (e.g., cooldown not ready)
    if (shouldLogDebug) {
      console.log(`⚠️ DEBUG: ${this.id} no strategy can execute, but target is in range`)
    }
    
    if (cooldownStateChanged) {
      this.lastCooldownState = isCooldownReady
    }
    
    return { attacked: false }
  }
}
