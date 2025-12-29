import { type } from '@colyseus/schema'
import { WorldLife } from './WorldLife'
import { PlayerInput } from './PlayerInput'
import { PLAYER_STATS } from '../config/combatConfig'
import { IAgent } from '../ai/interfaces/IAgent'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { PlayerSettingGameplay } from './PlayerSettingGameplay'
import { GAME_CONFIG } from '../config/gameConfig'

export class Player extends WorldLife implements IAgent {
  @type('string') sessionId: string
  @type('string') name: string
  @type('number') maxLinearSpeed: number = 20 // synced to clients
  @type('boolean') isBotMode: boolean = false // Synced: indicates if player is in bot mode
  
  @type(PlayerSettingGameplay) settingGameplay: PlayerSettingGameplay

  // Input state (server-only, not synced to clients)
  input: PlayerInput = new PlayerInput()

  // Target position for heading calculation (based on input direction)
  targetX: number = 0
  targetY: number = 0

  // Server-only desired velocity computed from input each tick (not synced)
  desiredVx: number = 0
  desiredVy: number = 0

  @type('number') castingUntil: number = 0 // Server-only, blocks movement

  // Cooldowns
  lastTrapTime: number = 0
  trapCooldown: number = 5000 // 5 seconds

  // AI Agent properties
  @type('string') currentBehavior: string = 'idle'
  @type('number') behaviorLockedUntil: number = 0
  @type('number') maxMoveSpeed: number = 20 // Same as maxLinearSpeed, for AI interface
  
  @type('string') currentAttackTarget: string = ''
  currentChaseTarget: string = ''
  attackStrategies: AttackStrategy[] = []
  decisionTimestamp: number = 0 

  constructor(sessionId: string, name: string, x: number = GAME_CONFIG.worldWidth / 2, y: number = GAME_CONFIG.worldHeight / 2) {
    // Ensure player radius never exceeds 1.3
    const playerRadius = Math.min(PLAYER_STATS.radius, 1.3)
    
    super({
      id: sessionId,
      x,
      y,
      vx: 0,
      vy: 0,
      tags: ['player'],
      radius: playerRadius,
      maxHealth: PLAYER_STATS.maxHealth,
      attackDamage: PLAYER_STATS.attackDamage,
      attackRange: PLAYER_STATS.attackRange,
      attackDelay: PLAYER_STATS.attackDelay,
      defense: PLAYER_STATS.defense,
      armor: PLAYER_STATS.armor,
      density: PLAYER_STATS.density,
    })
    this.sessionId = sessionId
    this.name = name
    this.maxMoveSpeed = this.maxLinearSpeed
    
    // Validate radius after construction
    if (this.radius > 1.3) {
      console.warn(`⚠️ Player ${this.id} radius ${this.radius} exceeds maximum of 1.3, clamping to 1.3`)
      this.radius = 1.3
    }

    // Initialize gameplay settings (defaults will be set in its constructor)
    this.settingGameplay = new PlayerSettingGameplay(x, y)
  }

  // Toggle bot mode
  setBotMode(enabled: boolean) {
    this.isBotMode = enabled
    if (!enabled) {
      // Reset AI state when disabling
      this.currentBehavior = 'idle'
      this.desiredVx = 0
      this.desiredVy = 0
      this.desiredVx = 0
      this.desiredVy = 0
    }
  }

  // Respawn player
  respawn(x: number, y: number) {
    super.respawn(x, y)
    this.input.clear()
    this.currentBehavior = 'idle'
    this.currentAttackTarget = ''
    this.currentChaseTarget = ''
  }

  // AI Interface: Apply behavior decision
  applyBehaviorDecision(decision: {
    behavior: string
    behaviorLockedUntil: number
    currentAttackTarget: string
    currentChaseTarget: string
    desiredVelocity?: { x: number; y: number }
  }): void {
    this.currentBehavior = decision.behavior
    this.behaviorLockedUntil = decision.behaviorLockedUntil
    this.currentAttackTarget = decision.currentAttackTarget
    this.currentChaseTarget = decision.currentChaseTarget
    
    // Apply desired velocity from decision
    if (decision.desiredVelocity) {
      this.desiredVx = decision.desiredVelocity.x
      this.desiredVy = decision.desiredVelocity.y
    } else {
      this.desiredVx = 0
      this.desiredVy = 0
    }
  }

  // AI Interface: Compute desired velocity
  // Deprecated: Velocity is now calculated by behaviors and passed via applyBehaviorDecision
  // Removed unused method

  // Generate a random wander target
  // Deprecated: Logic moved to WanderBehavior
  // Removed unused method

  // Update heading based on input direction (not physics velocity)
  updateHeadingFromInput(): void {
    // Dead players don't update heading
    if (!this.isAlive) return
    
    const inputMagnitude = this.input.getMovementMagnitude()
    if (inputMagnitude > 0.01) {
      // Use input direction for heading
      const normalized = this.input.getNormalizedMovement()
      this.heading = Math.atan2(normalized.y, normalized.x)
    }
  }

  // Find target in attack direction (heading-based)
  findTargetInDirection(mobs: Map<string, any>): any | null {
    if (!this.canAttack()) return null

    // Block targeting if frozen or stunned
    if (this.isFrozen || this.isStunned) return null

    const attackCone = Math.PI / 4 // 45-degree attack cone
    const maxRange = this.attackRange + this.radius
    let nearestTarget: any = null
    let nearestDistance = Infinity

    for (const mob of mobs.values()) {
      if (!mob.isAlive) continue

      const distance = this.getDistanceTo(mob)
      if (distance > maxRange + mob.radius) continue

      // Calculate angle between player heading and direction to mob
      const dx = mob.x - this.x
      const dy = mob.y - this.y
      const angleToMob = Math.atan2(dy, dx)
      const angleDiff = Math.abs(this.heading - angleToMob)

      // Check if mob is within attack cone (handle angle wrapping)
      const normalizedAngleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff)
      if (normalizedAngleDiff <= attackCone) {
        if (distance < nearestDistance) {
          nearestTarget = mob
          nearestDistance = distance
        }
      }
    }

    return nearestTarget
  }

  // Process attack input and find target
  // Allows attacks even without targets (for visual feedback/practice)
  processAttackInput(mobs: Map<string, any>, roomId: string): boolean {
    // Dead players cannot attack
    if (!this.isAlive) return false
    
    // If in bot mode, AI handles attacks
    if (this.isBotMode) {
        return false
    }

    if (!this.input.attack) return false
    
    // Status effect check
    if (this.isFrozen || this.isStunned) return false

    if (!this.canAttack()) {
        return false
    }
    
    const target = this.findTargetInDirection(mobs)
    const { eventBus, RoomEventType } = require('../events/EventBus')
    
    if (target) {
      // Emit attack event with target - let BattleManager handle the rest
      const attackData = {
        actorId: this.id,
        targetId: target.id,
        damage: this.attackDamage,
        range: this.attackRange,
        roomId: roomId
      }

      eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData)
      console.log(`⚔️ PLAYER ${this.id} attacking ${target.id} in heading direction`)
      return true
    } else {
      // No target found, but still allow attack (for visual feedback)
      // Update attack cooldown and animation state
      this.lastAttackTime = performance.now()
      this.isAttacking = true
      this.attackAnimationStartTime = performance.now()
      
      // Emit attack event without target
      const attackData = {
        actorId: this.id,
        // targetId omitted - no target
        damage: this.attackDamage,
        range: this.attackRange,
        roomId: roomId
      }

      eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData)
      console.log(`⚔️ PLAYER ${this.id} attacking (no target) in heading direction ${this.heading.toFixed(2)}`)
      return true
    }
  }
  
  // Execute attack for bot mode
  executeBotAttack(mobs: Map<string, any>, roomId: string): void {
    if (!this.canAttack()) return
    
    // Status effect check
    if (this.isFrozen || this.isStunned) return

    const { eventBus, RoomEventType } = require('../events/EventBus')
    
    // 1. Try to get target from AI decision
    let target = this.currentAttackTarget ? mobs.get(this.currentAttackTarget) : null
    
    // 2. If valid target, attack it
    if (target && target.isAlive) {
        const attackData = {
            actorId: this.id,
            targetId: target.id,
            damage: this.attackDamage,
            range: this.attackRange,
            roomId: roomId
        }
        eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData)
        // console.log(`⚔️ BOT PLAYER ${this.id} attacking ${target.id}`)
    } else {
        // 3. If no target (e.g. just attacking direction), or target lost
        // Try to find one in direction
        target = this.findTargetInDirection(mobs)
        
        const attackData = {
            actorId: this.id,
            targetId: target ? target.id : undefined,
            damage: this.attackDamage,
            range: this.attackRange,
            roomId: roomId
        }
        eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData)
        // console.log(`⚔️ BOT PLAYER ${this.id} attacking (dir)`)
    }

    // this.lastAttackTime = performance.now() // DELEGATED TO BATTLE MODULE
    this.isAttacking = true
    this.attackAnimationStartTime = performance.now()
  }

  // Override update to handle bot mode
  update(deltaTime: number, gameState?: any) {
    if (this.isBotMode) {
      // In bot mode, we use desiredVx/Vy from AI
      
      // Update heading based on movement
      if (Math.abs(this.desiredVx) > 0.1 || Math.abs(this.desiredVy) > 0.1) {
        this.heading = Math.atan2(this.desiredVy, this.desiredVx)
      }

      // Handle Bot Attack
      if (this.currentBehavior === 'attack' && gameState) {
          this.executeBotAttack(gameState.mobs, gameState.roomId)
      }

    } else {
      this.updateHeadingFromInput()
    }
    
    super.update(deltaTime)
  }
}
