import { type, MapSchema } from '@colyseus/schema'
import { WorldLife } from './WorldLife'
import { PlayerInput } from './PlayerInput'
import { PLAYER_STATS } from '../config/combatConfig'
import { IAgent } from '../ai/interfaces/IAgent'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { PlayerSettingGameplay } from './PlayerSettingGameplay'
import { GAME_CONFIG } from '../config/gameConfig'
import { PlayerCombatSystem } from '../systems/PlayerCombatSystem'
import { PlayerBotController } from '../systems/PlayerBotController'

export class Player extends WorldLife implements IAgent {
  @type('string') sessionId: string
  @type('string') name: string
  @type('number') maxLinearSpeed: number = 20 // synced to clients
  @type('boolean') isBotMode: boolean = false // Synced: indicates if player is in bot mode
  @type('boolean') isCasting: boolean = false // Synced: indicates if player is currently casting
  
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
  @type('number') castDuration: number = 0 // Synced: Total duration of current cast

  // Cooldown System
  @type({ map: "number" }) cooldowns = new MapSchema<number>(); // Action ID -> Timestamp when ready


  // AI Agent properties
  @type('string') currentBehavior: string = 'idle'
  @type('number') behaviorLockedUntil: number = 0
  @type('number') maxMoveSpeed: number = 20 // Same as maxLinearSpeed, for AI interface
  chaseRange: number = 15 // Server-only AI property
  
  @type('string') currentAttackTarget: string = ''
  currentChaseTarget: string = ''
  attackStrategies: AttackStrategy[] = []
  decisionTimestamp: number = 0 

  // Attack Wind-up State
  @type('boolean') pendingAttack: boolean = false
  @type('number') attackExecuteTime: number = 0
  @type('string') pendingAttackTargetId: string = '' 

  // Systems
  private combatSystem: PlayerCombatSystem
  private botController: PlayerBotController

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
      attackDelay: PLAYER_STATS.atkWindUpTime + PLAYER_STATS.atkWindDownTime,
      defense: PLAYER_STATS.defense,
      armor: PLAYER_STATS.armor,
      density: PLAYER_STATS.density,
    })
    this.sessionId = sessionId
    this.name = name
    this.maxMoveSpeed = PLAYER_STATS.maxMoveSpeed || 20
    this.maxLinearSpeed = this.maxMoveSpeed // Sync physics limit
    this.chaseRange = PLAYER_STATS.chaseRange || 15
    
    // Validate radius after construction
    if (this.radius > 1.3) {
      console.warn(`⚠️ Player ${this.id} radius ${this.radius} exceeds maximum of 1.3, clamping to 1.3`)
      this.radius = 1.3
    }

    // Initialize gameplay settings (defaults will be set in its constructor)
    this.settingGameplay = new PlayerSettingGameplay(x, y)
    
    // Initialize Systems
    this.combatSystem = new PlayerCombatSystem(this)
    this.botController = new PlayerBotController(this, this.combatSystem)
  }

  // Toggle bot mode
  setBotMode(enabled: boolean) {
    this.isBotMode = enabled
    if (!enabled) {
      // Reset AI state when disabling
      this.currentBehavior = 'idle'
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
    
    this.cooldowns.clear()
    this.cooldowns.clear()
    this.pendingAttack = false
    this.attackExecuteTime = 0
  }

  // Delegate Cooldown Checks to CombatSystem
  canPerformAction(cooldownKeys: string[]): boolean {
      return this.combatSystem.canPerformAction(cooldownKeys)
  }

  // Delegate Cooldown Sets to CombatSystem
  performAction(settings: Record<string, number>): void {
      this.combatSystem.performAction(settings)
  }

  // AI Interface: Apply behavior decision (Used by BotController logic mostly, but state stored here)
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
    const speedMultiplier = this.getSpeedMultiplier()
    if (decision.desiredVelocity) {
      this.desiredVx = decision.desiredVelocity.x * speedMultiplier
      this.desiredVy = decision.desiredVelocity.y * speedMultiplier
    } else {
      this.desiredVx = 0
      this.desiredVy = 0
    }
  }

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

  // findTargetInDirection DELEGATED via combatSystem
  findTargetInDirection(mobs: Map<string, any>): any | null {
      return this.combatSystem.findTargetInDirection(mobs)
  }

  // Delegate Attack Processing
  processAttackInput(mobs: Map<string, any>, roomId: string): boolean {
      return this.combatSystem.processAttackInput(mobs, roomId)
  }

  // Override update to handle systems
  update(deltaTime: number, gameState?: any) {
    // Delegate to Bot Controller
    if (this.isBotMode) {
      this.botController.update(deltaTime, gameState?.mobs, gameState?.roomId)
    } else {
      this.updateHeadingFromInput()
    }
    
    // Delegate to Combat System (Wind-up checks)
    this.combatSystem.update(deltaTime, gameState?.mobs, gameState?.roomId)
    
    super.update(deltaTime)
  }
}
