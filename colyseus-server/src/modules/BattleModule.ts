/**
 * BattleModule - Centralized combat system
 * Handles all HP management, attack events, and combat logic
 */

import { WorldLife } from '../schemas/WorldLife'
import { GameState } from '../schemas/GameState'
import { eventBus, RoomEventType } from '../events/EventBus'
import {
  BattleActionMessage,
  BattleActionProcessor,
  AttackActionPayload,
  HealActionPayload,
  KillActionPayload,
  RespawnActionPayload,
  DamageActionPayload,
} from './BattleActionMessage'

export interface AttackEvent {
  attackerId: string
  targetId: string
  damage: number
  targetDied: boolean
  timestamp: number
}

export interface CombatStats {
  maxHealth: number
  currentHealth: number
  attackDamage: number
  attackRange: number
  attackDelay: number
  defense: number
  armor: number
  isAlive: boolean
  isInvulnerable: boolean
  invulnerabilityDuration: number
}

export class BattleModule implements BattleActionProcessor {
  private attackEvents: AttackEvent[] = []
  private maxEventHistory = 100 // Keep last 100 events
  private gameState: GameState

  constructor(gameState: GameState) {
    this.gameState = gameState
  }

  // Process a direct attack between two entities (core attack logic)
  processAttack(attacker: WorldLife, target: WorldLife): AttackEvent | null {
    // Validate attack conditions
    const attackCheck = this.canAttack(attacker, target)
    if (!attackCheck.canAttack) {
      return null
    }

    // Log attack attempt
    console.log(`⚔️ ATTACK: ${attacker.id} attacking ${target.id}`)

    // Calculate damage with defense
    const damage = this.calculateDamage(attacker, target)
    console.log(`🎯 ATTACK: ${attacker.id} deals ${damage} damage to ${target.id}`)

    // Apply damage to target
    const targetDied = this.applyDamage(target, damage)

    // Emit battle damage produced event for knockback/FX
    try {
      eventBus.emitRoomEvent(this.gameState.roomId, RoomEventType.BATTLE_DAMAGE_PRODUCED, {
        attacker,
        taker: target,
      })
    } catch {}

    // Update attacker's last attack time using high-precision timing
    attacker.lastAttackTime = performance.now()
    attacker.isAttacking = true
    attacker.lastAttackedTarget = target.id

    // Create attack event
    const attackEvent: AttackEvent = {
      attackerId: attacker.id,
      targetId: target.id,
      damage,
      targetDied,
      timestamp: performance.now(),
    }

    // Store event
    this.addAttackEvent(attackEvent)

    // Reset attacking state after animation
    setTimeout(() => {
      attacker.isAttacking = false
    }, 200)

    return attackEvent
  }

  // Check if attacker can attack target
  canAttack(attacker: WorldLife, target: WorldLife): { canAttack: boolean; reason?: string } {
    if (!target.isAlive) {
      return { canAttack: false, reason: `target ${target.id} is not alive` }
    }

    if (!attacker.isAlive) {
      return { canAttack: false, reason: `attacker ${attacker.id} is not alive` }
    }

    // Check attack cooldown using high-precision timing
    if (!attacker.canAttack()) {
      const now = performance.now()
      const timeSinceLastAttack = now - attacker.lastAttackTime
      const remaining = attacker.attackDelay - timeSinceLastAttack
      return {
        canAttack: false,
        reason: `cooldown not ready (elapsed: ${timeSinceLastAttack.toFixed(0)}ms, delay: ${attacker.attackDelay}ms, remaining: ${remaining.toFixed(0)}ms)`
      }
    }

    // Check range
    const distance = attacker.getDistanceTo(target)
    const effectiveRange = attacker.attackRange + (attacker as any).radius + (target as any).radius
    if (distance > effectiveRange) {
      return {
        canAttack: false,
        reason: `out of range (distance: ${distance.toFixed(2)}, effectiveRange: ${effectiveRange.toFixed(2)}, baseRange: ${attacker.attackRange}, radii: ${(attacker as any).radius}+${(target as any).radius})`
      }
    }

    return { canAttack: true }
  }

  // Calculate damage with defense calculations
  calculateDamage(attacker: WorldLife, target: WorldLife): number {
    const baseDamage = attacker.attackDamage
    const totalDefense = target.defense + target.armor

    // Cap defense at 80% damage reduction
    const damageReduction = Math.min(totalDefense, baseDamage * 0.8)
    const finalDamage = Math.max(1, baseDamage - damageReduction)

    return Math.floor(finalDamage)
  }

  // Apply damage to target
  applyDamage(target: WorldLife, damage: number): boolean {
    if (!target.isAlive || target.isInvulnerable) return false

    // Log all damage (not just significant damage)
    console.log(
      `💔 DAMAGE: ${target.id} took ${damage} damage, HP: ${target.currentHealth} → ${target.currentHealth - damage}`
    )

    target.currentHealth = Math.max(0, target.currentHealth - damage)

    if (target.currentHealth <= 0) {
      target.die() // Entity state transition (sets diedAt timestamp for cleanup)
      console.log(`💀 KILL: ${target.id} has been killed`)
      return true // Entity died
    }

    // Trigger invulnerability frames
    if (damage > 0) {
      this.triggerInvulnerability(target, 100)
    }

    return false // Entity survived
  }

  // Heal an entity
  healEntity(entity: WorldLife, amount: number): boolean {
    if (!entity.isAlive) return false

    const oldHealth = entity.currentHealth
    entity.currentHealth = Math.min(entity.maxHealth, entity.currentHealth + amount)

    if (entity.currentHealth > oldHealth) {
      console.log(
        `💚 HEAL: ${entity.id} healed for ${entity.currentHealth - oldHealth} HP (${entity.currentHealth}/${entity.maxHealth})`
      )
      return true
    }

    return false
  }

  // Trigger invulnerability frames
  triggerInvulnerability(entity: WorldLife, duration: number): void {
    entity.isInvulnerable = true
    entity.invulnerabilityDuration = duration

    // Use high-precision timing for invulnerability frames
    setTimeout(() => {
      entity.isInvulnerable = false
      entity.invulnerabilityDuration = 0
    }, duration)
  }

  // Respawn an entity
  respawnEntity(entity: WorldLife, x?: number, y?: number): void {
    entity.isAlive = true
    entity.currentHealth = entity.maxHealth
    entity.isAttacking = false
    entity.isMoving = false
    entity.vx = 0
    entity.vy = 0
    entity.lastAttackTime = 0
    entity.attackCooldown = 0
    entity.isInvulnerable = false
    entity.invulnerabilityDuration = 0

    if (x !== undefined && y !== undefined) {
      entity.x = x
      entity.y = y
    }
  }

  // Get combat stats for an entity
  getCombatStats(entity: WorldLife): CombatStats {
    return {
      maxHealth: entity.maxHealth,
      currentHealth: entity.currentHealth,
      attackDamage: entity.attackDamage,
      attackRange: entity.attackRange,
      attackDelay: entity.attackDelay,
      defense: entity.defense,
      armor: entity.armor,
      isAlive: entity.isAlive,
      isInvulnerable: entity.isInvulnerable,
      invulnerabilityDuration: entity.invulnerabilityDuration,
    }
  }

  // Update entity combat state (invulnerability, cooldowns)
  updateCombatState(entity: WorldLife, deltaTime: number): void {
    // Update invulnerability
    if (entity.isInvulnerable && entity.invulnerabilityDuration > 0) {
      entity.invulnerabilityDuration -= deltaTime
      if (entity.invulnerabilityDuration <= 0) {
        entity.isInvulnerable = false
        entity.invulnerabilityDuration = 0
      }
    }

    // Update attack cooldown
    if (entity.attackCooldown > 0) {
      entity.attackCooldown -= deltaTime
    }
  }

  // Get recent attack events
  getRecentAttackEvents(limit: number = 10): AttackEvent[] {
    return this.attackEvents.slice(-limit)
  }

  // Get attack events for specific entity
  getAttackEventsForEntity(entityId: string, limit: number = 10): AttackEvent[] {
    return this.attackEvents
      .filter(event => event.attackerId === entityId || event.targetId === entityId)
      .slice(-limit)
  }

  // Clear old attack events
  clearOldEvents(): void {
    if (this.attackEvents.length > this.maxEventHistory) {
      this.attackEvents = this.attackEvents.slice(-this.maxEventHistory)
    }
  }

  // Entities are automatically available through GameState
  // No need for manual registration/unregistration

  // Process action message (implements BattleActionProcessor)
  async processAction(message: BattleActionMessage): Promise<boolean> {
    try {
      const actor = this.getEntity(message.actorId)
      const target: WorldLife | null = message.targetId
        ? (this.getEntity(message.targetId) ?? null)
        : null

      // Debug logging removed for production

      if (!actor) {
        console.warn(`⚠️ BATTLE: Actor ${message.actorId} not found in registry`)
        return false
      }

      switch (message.actionKey) {
        case 'attack':
          return this.handleAttackMessage(
            actor,
            target,
            message.actionPayload as AttackActionPayload
          )

        case 'heal':
          return this.processHealAction(actor, target, message.actionPayload as HealActionPayload)

        case 'kill':
          return this.processKillAction(actor, target, message.actionPayload as KillActionPayload)

        case 'respawn':
          return this.processRespawnAction(
            actor,
            target,
            message.actionPayload as RespawnActionPayload
          )

        case 'damage':
          return this.processDamageAction(
            actor,
            target,
            message.actionPayload as DamageActionPayload
          )

        default:
          console.warn(`⚠️ BATTLE: Unknown action key: ${message.actionKey}`)
          return false
      }
    } catch (error) {
      console.error(`❌ BATTLE: Error processing action:`, error)
      return false
    }
  }

  // Handle attack message from message system (wrapper around processAttack)
  private handleAttackMessage(
    actor: WorldLife,
    target: WorldLife | null,
    payload: AttackActionPayload
  ): boolean {
    if (!target) {
      console.warn(`⚠️ BATTLE: Attack action requires target`)
      return false
    }

    console.log(`📨 BATTLE: Processing attack action from ${actor.id} to ${target.id}`)

    // Process the attack (processAttack already validates range via canAttack())
    const attackEvent = this.processAttack(actor, target)
    if (attackEvent) {
      console.log(`✅ BATTLE: Attack processed successfully, ${attackEvent.damage} damage dealt`)
    } else {
      const attackCheck = this.canAttack(actor, target)
      console.log(`❌ BATTLE: Attack failed - ${attackCheck.reason || 'unknown reason'}`)
    }
    return attackEvent !== null
  }

  // Process heal action message
  private processHealAction(
    actor: WorldLife,
    target: WorldLife | null,
    payload: HealActionPayload
  ): boolean {
    const healTarget = target || actor // Heal self if no target
    return this.healEntity(healTarget, payload.amount)
  }

  // Process kill action message
  private processKillAction(
    actor: WorldLife,
    target: WorldLife | null,
    payload: KillActionPayload
  ): boolean {
    if (!target) {
      console.warn(`⚠️ BATTLE: Kill action requires target`)
      return false
    }

    target.die() // Entity state transition (sets diedAt timestamp for cleanup)
    console.log(`💀 BATTLE: ${actor.id} killed ${target.id} (${payload.reason || 'no reason'})`)
    return true
  }

  // Process respawn action message
  private processRespawnAction(
    actor: WorldLife,
    target: WorldLife | null,
    payload: RespawnActionPayload
  ): boolean {
    const respawnTarget = target || actor // Respawn self if no target
    this.respawnEntity(respawnTarget, payload.x, payload.y)

    if (payload.health !== undefined) {
      respawnTarget.currentHealth = payload.health
    }

    console.log(
      `🔄 BATTLE: ${respawnTarget.id} respawned at (${payload.x || respawnTarget.x}, ${payload.y || respawnTarget.y})`
    )
    return true
  }

  // Process damage action message
  private processDamageAction(
    actor: WorldLife,
    target: WorldLife | null,
    payload: DamageActionPayload
  ): boolean {
    if (!target) {
      console.warn(`⚠️ BATTLE: Damage action requires target`)
      return false
    }

    const died = this.applyDamage(target, payload.amount)
    // Emit battle damage produced event
    try {
      eventBus.emitRoomEvent(this.gameState.roomId, RoomEventType.BATTLE_DAMAGE_PRODUCED, {
        attacker: actor,
        taker: target,
      })
    } catch {}
    console.log(
      `💔 BATTLE: ${actor.id} dealt ${payload.amount} ${payload.damageType || 'physical'} damage to ${target.id}`
    )
    return true
  }

  // Get all entities from GameState
  getAllEntities(): WorldLife[] {
    const entities: WorldLife[] = []
    
    // Add all players
    for (const player of this.gameState.players.values()) {
      entities.push(player)
    }
    
    // Add all mobs
    for (const mob of this.gameState.mobs.values()) {
      entities.push(mob)
    }
    
    return entities
  }

  // Get entity by ID from GameState
  getEntity(entityId: string): WorldLife | undefined {
    // Check players first
    const player = this.gameState.players.get(entityId)
    if (player) return player
    
    // Check mobs
    const mob = this.gameState.mobs.get(entityId)
    if (mob) return mob
    
    return undefined
  }

  // All convenience methods removed - use BattleManager static methods instead

  // Action message management
  addActionMessage(message: BattleActionMessage): void {
    // For now, process immediately - could be queued for batch processing
    this.processAction(message)
  }

  async processActionMessages(): Promise<number> {
    // For now, return 0 as we process immediately
    // Could be extended to batch process queued messages
    return 0
  }

  // Private helper methods
  // Distance handled by WorldObject.getDistanceTo()

  private addAttackEvent(event: AttackEvent): void {
    this.attackEvents.push(event)
    this.clearOldEvents()
  }
}
