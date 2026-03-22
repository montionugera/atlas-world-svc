import { type } from '@colyseus/schema'
import { WorldLife } from './WorldLife'
import { BehaviorState } from '../ai/behaviors/BehaviorState'
import { IAgent } from '../ai/interfaces/IAgent'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { NPCCombatSystem } from '../systems/NPCCombatSystem'
import { TEAMS } from '../config/gameConfig'
import { GameState } from './GameState'
import { PLAYER_STATS, type PlayerCombatStats } from '../config/combatConfig'

export interface NPCOptions {
  id: string
  ownerId?: string
  name?: string
  x: number
  y: number
  /** When set, NPC uses player-like stats from combatConfig (PLAYER_STATS). Omitted = use defaults. */
  stats?: Partial<PlayerCombatStats>
}

const DEFAULT_NPC_STATS = {
  radius: PLAYER_STATS.radius,
  maxHealth: PLAYER_STATS.maxHealth,
  pAtk: PLAYER_STATS.pAtk,
  attackRange: PLAYER_STATS.attackRange,
  atkWindUpTime: PLAYER_STATS.atkWindUpTime,
  atkWindDownTime: PLAYER_STATS.atkWindDownTime,
  pDef: PLAYER_STATS.pDef,
  mDef: PLAYER_STATS.mDef,
  armor: PLAYER_STATS.armor,
  density: PLAYER_STATS.density,
  chaseRange: PLAYER_STATS.chaseRange,
  maxMoveSpeed: PLAYER_STATS.maxMoveSpeed,
} as const

export class NPC extends WorldLife implements IAgent {
  @type('string') ownerId: string = '' // Optional: player id this NPC belongs to (empty = standalone)
  @type('string') name: string = 'NPC'
  @type('string') currentBehavior: BehaviorState = BehaviorState.IDLE
  @type('number') behaviorLockedUntil: number = 0
  @type('number') castDuration: number = 0
  @type('boolean') isCasting: boolean = false
  @type('number') maxMoveSpeed: number = PLAYER_STATS.maxMoveSpeed
  @type('string') tag: string = BehaviorState.IDLE

  // Server-only fields
  desiredVx: number = 0
  desiredVy: number = 0
  chaseRange: number = PLAYER_STATS.chaseRange
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
  baseWindDownTime: number = PLAYER_STATS.atkWindDownTime
  lastCooldownState: boolean = false

  // Respawn system
  respawnTimeMs: number = 10000 // 10 seconds to respawn

  combatSystem: NPCCombatSystem

  constructor(options: NPCOptions) {
    const stats = { ...DEFAULT_NPC_STATS, ...options.stats }
    const attackDelay = (stats.atkWindUpTime ?? PLAYER_STATS.atkWindUpTime) + (stats.atkWindDownTime ?? PLAYER_STATS.atkWindDownTime)
    super({
      id: options.id,
      x: options.x,
      y: options.y,
      radius: stats.radius,
      maxHealth: stats.maxHealth,
      pAtk: stats.pAtk ?? 10,
      attackRange: stats.attackRange,
      attackDelay,
      pDef: stats.pDef,
      mDef: stats.mDef,
      armor: stats.armor,
      density: stats.density,
      tags: ['npc', 'player'], // 'player' for AI: target mobs like bot player
    })
    this.ownerId = options.ownerId ?? ''
    this.name = options.name ?? 'NPC'
    this.maxMoveSpeed = stats.maxMoveSpeed
    this.chaseRange = stats.chaseRange
    this.baseWindDownTime = stats.atkWindDownTime
    this.teamId = TEAMS.IRON_HAMMER
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
      // Heading: face attack target when attacking (bot-style); else set by physics sync from velocity
      if (this.currentBehavior === BehaviorState.ATTACK && this.currentAttackTarget) {
        const target = gameState.mobs.get(this.currentAttackTarget)
        if (target && target.isAlive) {
          const dx = target.x - this.x
          const dy = target.y - this.y
          if (dx * dx + dy * dy > 0.01) {
            this.heading = Math.atan2(dy, dx)
          }
        }
      }
      return this.combatSystem.update(deltaTime, gameState.mobs, gameState.roomId)
    }

    return { attacked: false }
  }

  updateTargetPosition(gameState: GameState): void {
    if (this.currentBehavior === BehaviorState.CHASE && this.currentChaseTarget) {
      const chaseTarget =
        gameState.players.get(this.currentChaseTarget) ??
        gameState.mobs.get(this.currentChaseTarget) ??
        null
      if (chaseTarget && chaseTarget.isAlive) {
        this.targetX = chaseTarget.x
        this.targetY = chaseTarget.y
        if (this.ownerId && 'sessionId' in chaseTarget) {
          const dist = this.getDistanceTo(chaseTarget)
          if (dist > 100) {
            this.x = chaseTarget.x
            this.y = chaseTarget.y
          }
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
