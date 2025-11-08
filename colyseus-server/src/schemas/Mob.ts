import { type } from '@colyseus/schema'
import { WorldLife } from './WorldLife'
import { GameState } from './GameState'
import { Player } from './Player'
import { BattleManager } from '../modules/BattleManager'
import { eventBus, RoomEventType, BattleAttackData } from '../events/EventBus'
import { MOB_STATS } from '../config/combatConfig'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
// Removed global BattleManager singleton - now using room-scoped instances

export class Mob extends WorldLife {
  @type('string') tag: string = 'idle' // Current behavior tag for debugging/UI // Send radius to client
  @type('string') currentBehavior: string = 'idle'
  @type('number') behaviorLockedUntil: number = 0 // epoch ms; 0 means unlocked
  @type('boolean') isWindingUp: boolean = false // Synced: wind-up state for client animation
  // Server-only fields (not synced to clients)
  mass: number = 1 // cached mass for steering calculations
  desiredVx: number = 0
  desiredVy: number = 0
  desiredBehavior: string = 'idle'
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
  windUpStartTime: number = 0
  
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
    
    // Dead mobs past respawn delay
    if (!this.isAlive && this.diedAt > 0) {
      const timeDead = Date.now() - this.diedAt
      return timeDead >= respawnDelayMs
    }
    
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
    attackDelay?: number
    defense?: number
    armor?: number
    density?: number
    maxMoveSpeed?: number
    attackStrategies?: AttackStrategy[]
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
      attackDelay: options.attackDelay ?? MOB_STATS.attackDelay,
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
    
    // Initialize attack strategies (default to melee if none provided)
    if (options.attackStrategies && options.attackStrategies.length > 0) {
      this.attackStrategies = options.attackStrategies
    } else {
      // Default: melee attack strategy (will be set up later if needed)
      this.attackStrategies = []
    }
  }

  // Override WorldLife update to include game logic
  update(
    deltaTime: number,
    gameState?: GameState
  ): { attacked: boolean; targetId?: string; messageCreated?: boolean; message?: any } {
    // Call parent update for health/invulnerability logic
    super.update(deltaTime)

    // Game logic: position, heading, and attack (if gameState provided)
    if (gameState) {
      // Update position logic and target tracking
      this.updateMobPosition(gameState.players)

      // Update heading based on current target
      this.updateHeadingToTarget()

      // Update attack logic and return result
      return this.updateAttack(gameState.players, gameState.roomId)
    }

    return { attacked: false }
  }

  // Simple behavior: just distance-based with cooldown
  decideBehavior(env: {
    nearestPlayer?: { x: number; y: number; id: string } | null
    distanceToNearestPlayer?: number
    nearBoundary?: boolean
    worldBounds?: { width: number; height: number }
  }) {
    const now = performance.now()

    // Simple cooldown to prevent rapid switching
    if (this.behaviorLockedUntil && now < this.behaviorLockedUntil) {
      return this.currentBehavior
    }

    const distance = env.distanceToNearestPlayer ?? Infinity
    const oldBehavior = this.currentBehavior

    // Check boundary with buffer + radius to prevent wall hitting
    const boundaryBuffer = 5 // Buffer distance from wall
    const worldWidth = env.worldBounds?.width ?? 400
    const worldHeight = env.worldBounds?.height ?? 300
    const effectiveThreshold = boundaryBuffer + this.radius // Account for mob size
    
    // Use environment flag if provided, otherwise calculate from position
    const veryNearBoundary = env.nearBoundary ?? (
      this.x < effectiveThreshold ||
      this.x > worldWidth - effectiveThreshold ||
      this.y < effectiveThreshold ||
      this.y > worldHeight - effectiveThreshold
    )

    // Determine effective attack range
    // For ranged attacks (spears), use maxRange directly without adding radii
    // For melee attacks, add radii for collision-based range
    const playerRadius = 4 // Default player radius (from Player.ts)
    let effectiveAttackRange: number
    
    // Check if mob has spear throw strategy (ranged attack)
    const spearStrategy = this.attackStrategies.find(s => s.name === 'spearThrow')
    if (spearStrategy && (spearStrategy as any).maxRange) {
      // Ranged attack: use maxRange directly (no radius addition needed)
      effectiveAttackRange = (spearStrategy as any).maxRange
    } else {
      // Melee attack: add radii for collision-based range
      effectiveAttackRange = this.attackRange + this.radius + playerRadius
    }

    // Debug: Log distance and attack range occasionally
    if (Math.random() < 0.01) {
      // 1% chance
      console.log(
        `🎯 MOB ${this.id}: distance=${distance.toFixed(2)}, attackRange=${this.attackRange}, mobRadius=${this.radius}, playerRadius=${playerRadius}, effectiveRange=${effectiveAttackRange.toFixed(2)}, hasSpear=${!!spearStrategy}`
      )
    }

    if (veryNearBoundary) {
      // Very close to boundary: Avoid boundary behavior (highest priority)
      this.currentBehavior = 'avoidBoundary'
      this.behaviorLockedUntil = now + 200 // Short lock time
      this.currentAttackTarget = ''
      this.currentChaseTarget = ''
    } else if (distance <= effectiveAttackRange) {
      // Very close: Attack
      this.currentBehavior = 'attack'
      this.behaviorLockedUntil = now + 500 // 0.5 second lock
      if (env.nearestPlayer) {
        this.currentAttackTarget = env.nearestPlayer.id || 'unknown'
      }
      this.currentChaseTarget = ''
    } else if (distance <= 25) {
      // Medium: Chase
      this.currentBehavior = 'chase'
      this.behaviorLockedUntil = now // not lock
      if (env.nearestPlayer) {
        this.currentChaseTarget = env.nearestPlayer.id || 'unknown'
      }
      this.currentAttackTarget = ''
    } else {
      // Far: Wander
      this.currentBehavior = 'wander'
      this.currentAttackTarget = ''
      this.currentChaseTarget = ''
    }

    this.tag = this.currentBehavior

    // Log only when behavior actually changes
    if (oldBehavior !== this.currentBehavior) {
      console.log(`🔄 BEHAVIOR: ${this.id} ${oldBehavior} → ${this.currentBehavior.toUpperCase()}`)
    }

    return this.currentBehavior
  }

  // Compute desired velocity based on currentBehavior
  computeDesiredVelocity(env: {
    nearestPlayer?: { x: number; y: number; id: string; radius: number } | null
    distanceToNearestPlayer?: number
    worldBounds?: { width: number; height: number }
  }): { x: number; y: number } {
    const maxSpeed = this.maxMoveSpeed

    // Avoid boundary behavior: move away from nearest boundary
    if (this.currentBehavior === 'avoidBoundary') {
      const worldWidth = env.worldBounds?.width ?? 400
      const worldHeight = env.worldBounds?.height ?? 300

      // Calculate avoidance force based on distance to each boundary
      let avoidX = 0,
        avoidY = 0
      const boundaryBuffer = 1 // Buffer distance from wall
      const effectiveThreshold = boundaryBuffer + this.radius // Account for mob size

      // Avoid left boundary
      if (this.x < effectiveThreshold) {
        avoidX += (effectiveThreshold - this.x) / effectiveThreshold
      }

      // Avoid right boundary
      if (this.x > worldWidth - effectiveThreshold) {
        avoidX -= (this.x - (worldWidth - effectiveThreshold)) / effectiveThreshold
      }

      // Avoid top boundary
      if (this.y < effectiveThreshold) {
        avoidY += (effectiveThreshold - this.y) / effectiveThreshold
      }

      // Avoid bottom boundary
      if (this.y > worldHeight - effectiveThreshold) {
        avoidY -= (this.y - (worldHeight - effectiveThreshold)) / effectiveThreshold
      }

      // Normalize and apply speed
      const magnitude = Math.hypot(avoidX, avoidY)
      if (magnitude > 0) {
        const speed = Math.min(maxSpeed) // Gentle speed for avoidance
        return {
          x: (avoidX / magnitude) * speed,
          y: (avoidY / magnitude) * speed,
        }
      }

      // If no clear direction, move toward center
      const centerX = worldWidth / 2
      const centerY = worldHeight / 2
      const dx = centerX - this.x
      const dy = centerY - this.y
      const distance = Math.hypot(dx, dy)
      if (distance > 0) {
        const speed = Math.min(maxSpeed)
        return { x: (dx / distance) * speed, y: (dy / distance) * speed }
      }

      return { x: 0, y: 0 }
    }

    // Attack behavior: stop moving (stand and attack)
    if (this.currentBehavior === 'attack') {
      // Debug: Log when mob is in attack behavior
      if (Math.random() < 0.01) {
        // 1% chance
        console.log(`🗡️ MOB ${this.id} in ATTACK behavior - should be stopped`)
      }
      return { x: 0, y: 0 }
    }

    // Chase behavior: move toward player
    if (this.currentBehavior === 'chase') {
      const target = env.nearestPlayer
      if (target) {
        const dx = target.x - this.x
        const dy = target.y - this.y
        const rawDistance = Math.hypot(dx, dy) || 1
        const effectiveDistance = rawDistance - this.radius - target.radius
        const direction = { x: dx / rawDistance, y: dy / rawDistance }

        // Calculate stopping distance: v² = 2as, so s = v²/(2a)
        // With acceleration 5 and time 50ms (0.05s), max speed = a * t = 5 * 0.05 = 0.25
        const maxStoppingSpeed = 3 // Maximum speed that can stop in 50ms with accel 5

        // If distance to target (minus mob radius) > 8, use normal chase speed
        if (effectiveDistance > 3) {
          const speed = Math.min(maxSpeed, this.maxMoveSpeed) // Respect mob cap
          return { x: direction.x * speed, y: direction.y * speed }
        } else {
          // Close to target: use speed that allows stopping in 50ms
          const speed = Math.min(maxStoppingSpeed, this.maxMoveSpeed)
          return { x: direction.x * speed, y: direction.y * speed }
        }
      }
    }

    // Wander behavior: move toward wander target
    if (this.currentBehavior === 'wander') {
      const now = performance.now()
      const wanderCooldown = 8000 // 5 seconds

      // Generate new wander target if needed
      if (
        now - this.lastWanderTargetTime > wanderCooldown ||
        Math.hypot(this.wanderTargetX - this.x, this.wanderTargetY - this.y) < 5
      ) {
        this.generateWanderTarget()
        this.lastWanderTargetTime = now
      }

      // Move toward wander target
      const dx = this.wanderTargetX - this.x
      const dy = this.wanderTargetY - this.y
      const distance = Math.hypot(dx, dy)

      if (distance > 0.1) {
        const speed = Math.min(maxSpeed * 0.6, this.maxMoveSpeed) // Slower wander speed capped by mob
        return { x: (dx / distance) * speed, y: (dy / distance) * speed }
      }
    }

    // Fallback: keep current velocity with slight damping
    return { x: this.vx * 0.8, y: this.vy * 0.8 }
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
  updateHeadingToTarget(): void {
    const dx = this.targetX - this.x
    const dy = this.targetY - this.y
    const magnitude = Math.hypot(dx, dy)
    if (magnitude > 0.01) {
      // Always show intent to target
      this.heading = Math.atan2(dy, dx)
    }
  }

  // Update position logic - handles movement, target tracking, and heading updates
  updateMobPosition(players: Map<string, any>): {
    moved: boolean
    targetX?: number
    targetY?: number
  } {
    // Update target positions for heading calculation based on current behavior
    if (this.currentBehavior === 'attack' && this.currentAttackTarget) {
      const attackTarget = players.get(this.currentAttackTarget)
      if (attackTarget && attackTarget.isAlive) {
        this.targetX = attackTarget.x
        this.targetY = attackTarget.y
        return { moved: true, targetX: this.targetX, targetY: this.targetY }
      }
    } else if (this.currentBehavior === 'chase' && this.currentChaseTarget) {
      const chaseTarget = players.get(this.currentChaseTarget)
      if (chaseTarget && chaseTarget.isAlive) {
        this.targetX = chaseTarget.x
        this.targetY = chaseTarget.y
        return { moved: true, targetX: this.targetX, targetY: this.targetY }
      }
    } else if (this.currentBehavior === 'wander') {
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
    if (this.currentBehavior !== 'attack' || !this.currentAttackTarget) {
      return { attacked: false }
    }

    const targetPlayer = players.get(this.currentAttackTarget)
    if (!targetPlayer || !targetPlayer.isAlive) {
      // Target is dead or doesn't exist, clear attack target
      this.currentAttackTarget = ''
      this.currentBehavior = 'wander' // Fallback to wander
      this.isWindingUp = false
      this.windUpStartTime = 0
      return { attacked: false }
    }

    // Update target position for heading calculation
    this.targetX = targetPlayer.x
    this.targetY = targetPlayer.y

    // Use attack strategies if available
    if (this.attackStrategies.length > 0) {
      return this.updateAttackWithStrategies(targetPlayer, roomId || '')
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
      this.currentBehavior = 'chase'
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

  // Update attack using attack strategies
  private updateAttackWithStrategies(
    targetPlayer: Player,
    roomId: string
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } {
    const currentTimeMs = Date.now() // For wind-up timing (milliseconds since epoch)
    const currentTimePerf = performance.now() // For attack cooldown timing (high precision)

    // Check if we're in wind-up phase
    if (this.isWindingUp && this.windUpStartTime > 0) {
      const windUpDurationMs = this.currentAttackStrategy?.getWindUpTime() || 0
      const windUpElapsedMs = currentTimeMs - this.windUpStartTime

      if (windUpElapsedMs >= windUpDurationMs) {
        // Wind-up complete, execute attack
        this.isWindingUp = false
        if (this.currentAttackStrategy) {
          console.log(`🎯 DEBUG: ${this.id} wind-up complete, executing ${this.currentAttackStrategy.name} attack`)
          const attackExecuted = this.currentAttackStrategy.execute(this, targetPlayer, roomId)
          if (attackExecuted) {
            this.lastAttackTime = performance.now()
            this.isAttacking = true
            // Reset attacking state after animation
            setTimeout(() => {
              this.isAttacking = false
            }, 200)
            return { attacked: true, targetId: targetPlayer.id, eventEmitted: true }
          } else {
            console.log(`❌ DEBUG: ${this.id} strategy.execute() returned false`)
          }
        }
        this.windUpStartTime = 0
        this.currentAttackStrategy = null
      } else {
        // Still in wind-up
        return { attacked: false }
      }
    }

    // Find first strategy that can execute
    // Sort strategies by priority: melee first (shorter range), then ranged
    const strategiesByPriority = [...this.attackStrategies].sort((strategyA, strategyB) => {
      // Melee strategies (0 wind-up) should be checked first
      if (strategyA.getWindUpTime() === 0 && strategyB.getWindUpTime() > 0) return -1
      if (strategyA.getWindUpTime() > 0 && strategyB.getWindUpTime() === 0) return 1
      // If both same wind-up, prefer shorter range (melee typically has shorter range)
      const strategyARange = strategyA.name === 'melee' 
        ? this.attackRange + this.radius + targetPlayer.radius
        : (strategyA as any).maxRange || this.attackRange
      const strategyBRange = strategyB.name === 'melee'
        ? this.attackRange + this.radius + targetPlayer.radius
        : (strategyB as any).maxRange || this.attackRange
      return strategyARange - strategyBRange
    })
    
    // Check attack cooldown status
    const isCooldownReady = this.canAttack()
    const cooldownElapsedMs = currentTimePerf - this.lastAttackTime
    const cooldownRemainingMs = Math.max(0, this.attackDelay - cooldownElapsedMs)
    const distanceToTargetPlayer = this.getDistanceTo(targetPlayer)
    
    console.log(`🔍 DEBUG: ${this.id} checking ${strategiesByPriority.length} strategies`)
    console.log(`  📊 Cooldown: ready=${isCooldownReady}, elapsed=${cooldownElapsedMs.toFixed(0)}ms, delay=${this.attackDelay}ms, remaining=${cooldownRemainingMs.toFixed(0)}ms`)
    console.log(`  📏 Distance: ${distanceToTargetPlayer.toFixed(2)} units to target`)
    
    for (const strategy of strategiesByPriority) {
      const strategyCanExecute = strategy.canExecute(this, targetPlayer)
      const strategyDistanceToTargetPlayer = this.getDistanceTo(targetPlayer)
      const strategyEffectiveRange = strategy.name === 'melee' 
        ? this.attackRange + this.radius + targetPlayer.radius
        : (strategy as any).maxRange || this.attackRange
      const strategyWindUpMs = strategy.getWindUpTime()
      
      console.log(`  🔍 Strategy "${strategy.name}": canExecute=${strategyCanExecute}, distance=${strategyDistanceToTargetPlayer.toFixed(2)}, effectiveRange=${strategyEffectiveRange.toFixed(2)}, windUp=${strategyWindUpMs}ms`)
      
      if (strategyCanExecute) {
        if (strategyWindUpMs > 0) {
          // Start wind-up
          console.log(`⏳ DEBUG: ${this.id} starting wind-up for ${strategy.name} (${strategyWindUpMs}ms)`)
          this.isWindingUp = true
          this.windUpStartTime = currentTimeMs
          this.currentAttackStrategy = strategy
          return { attacked: false }
        } else {
          // Instant attack
          console.log(`⚡ DEBUG: ${this.id} executing instant ${strategy.name} attack`)
          const attackExecuted = strategy.execute(this, targetPlayer, roomId)
          if (attackExecuted) {
            // Don't set lastAttackTime here - BattleModule will set it after validating the attack
            // Setting it here causes canAttack() to fail in BattleModule.processAttack()
            this.isAttacking = true
            this.lastCooldownState = false // Cooldown will start after BattleModule processes attack
            setTimeout(() => {
              this.isAttacking = false
            }, 200)
            return { attacked: true, targetId: targetPlayer.id, eventEmitted: true }
          } else {
            console.log(`❌ DEBUG: ${this.id} ${strategy.name}.execute() returned false`)
          }
        }
      }
    }

    // No strategy can execute - check if target out of range
    const distanceToTargetForBehaviorCheck = this.getDistanceTo(targetPlayer)
    const maxAttackRange = Math.max(...this.attackStrategies.map(strategy => {
      if (strategy.name === 'spearThrow') {
        return (strategy as any).maxRange || this.attackRange
      }
      return this.attackRange + this.radius + targetPlayer.radius
    }))

    if (distanceToTargetForBehaviorCheck > maxAttackRange) {
      // Target moved out of range, switch to chase behavior
      console.log(`🎯 DEBUG: ${this.id} target out of range (${distanceToTargetForBehaviorCheck.toFixed(2)} > ${maxAttackRange.toFixed(2)}), switching to chase`)
      this.currentBehavior = 'chase'
      this.currentChaseTarget = this.currentAttackTarget
      this.currentAttackTarget = ''
      this.isWindingUp = false
      this.windUpStartTime = 0
      return { attacked: false }
    }

    console.log(`⚠️ DEBUG: ${this.id} no strategy can execute, but target is in range`)
    return { attacked: false }
  }

  // Generate a random wander target
  private generateWanderTarget(): void {
    const wanderRadius = 30
    const wanderDistance = 20
    const wanderJitter = 10

    // Generate random point around current position
    const angle = Math.random() * Math.PI * 2
    const distance = wanderDistance + Math.random() * wanderJitter

    this.wanderTargetX = this.x + Math.cos(angle) * distance
    this.wanderTargetY = this.y + Math.sin(angle) * distance

    // Keep within world bounds (assuming 400x300 world)
    this.wanderTargetX = Math.max(20, Math.min(380, this.wanderTargetX))
    this.wanderTargetY = Math.max(20, Math.min(280, this.wanderTargetY))
  }
}
