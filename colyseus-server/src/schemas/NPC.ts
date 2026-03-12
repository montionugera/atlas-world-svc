import { type } from '@colyseus/schema'
import { WorldLife } from './WorldLife'
import { BehaviorState } from '../ai/behaviors/BehaviorState'
import { IAgent } from '../ai/interfaces/IAgent'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { NPCCombatSystem } from '../systems/NPCCombatSystem'
import { TEAMS } from '../config/gameConfig'
import { GameState } from './GameState'

export class NPC extends WorldLife implements IAgent {
  @type('string') ownerId: string = '' // The ID of the player this npc belongs to
  @type('string') name: string = 'NPC'
  @type('string') currentBehavior: BehaviorState = BehaviorState.IDLE
  @type('number') behaviorLockedUntil: number = 0
  @type('number') castDuration: number = 0
  @type('boolean') isCasting: boolean = false
  @type('number') maxMoveSpeed: number = 22 // Slightly faster than player to catch up
  @type('string') tag: string = BehaviorState.IDLE

  // Server-only fields
  desiredVx: number = 0
  desiredVy: number = 0
  chaseRange: number = 15
  currentAttackTarget: string = ''
  currentChaseTarget: string = ''
  targetX: number = 0
  targetY: number = 0
  decisionTimestamp: number = 0
  
  // Attack system
  attackStrategies: AttackStrategy[] = []
  currentAttackStrategy: AttackStrategy | null = null
  castStartTime: number = 0
  attackQueue: any[] = []

  // Combat specific
  baseWindDownTime: number = 200
  lastCooldownState: boolean = false

  // Respawn system
  respawnTimeMs: number = 10000 // 10 seconds to respawn
  
  combatSystem: NPCCombatSystem

  constructor(options: {
    id: string
    ownerId: string
    name?: string
    x: number
    y: number
  }) {
    super({
      id: options.id,
      x: options.x,
      y: options.y,
      radius: 3, // Slightly smaller than player
      maxHealth: 150, // Fixed stats for now
      attackDamage: 15, // Fixed stats for now
      attackRange: 6,
      attackDelay: 1000,
      defense: 5,
      armor: 2,
      density: 1,
      tags: ['npc']
    })
    
    this.ownerId = options.ownerId
    this.name = options.name || 'NPC'
    this.teamId = TEAMS.IRON_HAMMER // Friendly to players
    this.combatSystem = new NPCCombatSystem(this)
  }

  applyBehaviorDecision(decision: {
    behavior: BehaviorState
    behaviorLockedUntil: number
    currentAttackTarget: string
    currentChaseTarget: string
    desiredVelocity?: { x: number; y: number }
  }): void {
    if (this.isCasting) {
      this.desiredVx = 0
      this.desiredVy = 0
      return
    }

    this.currentBehavior = decision.behavior
    this.behaviorLockedUntil = decision.behaviorLockedUntil
    this.currentAttackTarget = decision.currentAttackTarget
    this.currentChaseTarget = decision.currentChaseTarget
    this.tag = this.currentBehavior

    if (decision.desiredVelocity) {
      const multiplier = this.getSpeedMultiplier()
      this.desiredVx = decision.desiredVelocity.x * multiplier
      this.desiredVy = decision.desiredVelocity.y * multiplier
    } else {
      this.desiredVx = 0
      this.desiredVy = 0
    }
  }

  update(deltaTime: number, gameState?: GameState): { attacked: boolean; targetId?: string; messageCreated?: boolean; message?: any } {
    super.update(deltaTime)

    if (this.isStunned) {
      this.vx = 0
      this.vy = 0
      this.isMoving = false
      this.isCasting = false
      this.castDuration = 0
      if (this.attackQueue.length > 0) {
        this.attackQueue.length = 0
        this.currentAttackStrategy = null
        this.castStartTime = 0
      }
      return { attacked: false }
    }

    if (gameState) {
      this.updateTargetPosition(gameState)
      this.updateHeadingToTarget(deltaTime)
      return this.combatSystem.update(deltaTime, gameState.mobs, gameState.roomId)
    }

    return { attacked: false }
  }

  updateTargetPosition(gameState: GameState): void {
    if (this.currentBehavior === BehaviorState.CHASE && this.currentChaseTarget) {
        const owner = gameState.players.get(this.currentChaseTarget)
        if (owner && owner.isAlive) {
            this.targetX = owner.x
            this.targetY = owner.y
            
            // Anti-stuck teleport
            const dist = this.getDistanceTo(owner)
            if (dist > 100) {
                this.x = owner.x
                this.y = owner.y
            }
        }
    } else if (this.currentBehavior === BehaviorState.ATTACK && this.currentAttackTarget) {
        const target = gameState.mobs.get(this.currentAttackTarget)
        if (target && target.isAlive) {
            this.targetX = target.x
            this.targetY = target.y
        }
    }
  }

  updateHeadingToTarget(deltaTime: number): void {
    const dx = this.targetX - this.x
    const dy = this.targetY - this.y
    if (Math.hypot(dx, dy) > 0.1) {
      this.heading = Math.atan2(dy, dx)
    }
  }

  // Add attacks to the timeline
  public enqueueAttacks(
      strategy: AttackStrategy, 
      targetId: string, 
      attacks: any[], 
      startTime: number
  ): void {
      this.combatSystem.enqueueAttacks(strategy, targetId, attacks, startTime)
  }
}
