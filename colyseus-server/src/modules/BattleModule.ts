/**
 * BattleModule - Centralized combat system
 * Handles all HP management, attack events, and combat logic
 */

import { WorldLife } from '../schemas/WorldLife'
import { BattleStatus } from '../schemas/BattleStatus'
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

  // isInvulnerable removed
}

export class BattleModule implements BattleActionProcessor {
  private attackEvents: AttackEvent[] = []
  private maxEventHistory = 100 // Keep last 100 events
  private processedIdsCleanupInterval = 5000 // Cleanup every 5s


  private lastCleanupTime = 0
  
  // Centralized Event Tracking: Map<EntityId, Map<EventId, Timestamp>>
  private processedEventsByEntityId: Map<string, Map<string, number>> = new Map()
  
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
    attacker.attackAnimationStartTime = performance.now() // Track animation start for update loop
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
  applyDamage(target: WorldLife, damage: number, options?: { eventId?: string }): boolean {
    if (!target.isAlive) return false

    // Event Validation
    if (options?.eventId) {
        if (!this.validateEvent(target, options.eventId)) {
            // Already processed this event
            return false;
        }
    }

    // Validate damage (must be non-negative)
    const validDamage = Math.max(0, damage)
    if (validDamage === 0) return false // No damage to apply

    // Log damage
    console.log(
      `💔 DAMAGE: ${target.id} took ${validDamage} damage, HP: ${target.currentHealth} → ${target.currentHealth - validDamage}`
    )

    target.currentHealth = Math.max(0, target.currentHealth - validDamage)

    if (target.currentHealth <= 0) {
      target.die() // Entity state transition (sets diedAt timestamp for cleanup)
      console.log(`💀 KILL: ${target.id} has been killed`)
      return true // Entity died
    }

    // Invulnerability removed
    // this.triggerInvulnerability(target, 100)

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

  // Apply a status effect to an entity
  applyStatusEffect(entity: WorldLife, type: string, duration: number, baseChance: number = 1.0, options?: { 
      bypassInvulnerability?: boolean, 
      eventId?: string,
      sourceId?: string,
      value?: number,
      interval?: number 
  }): boolean {
    if (!entity.isAlive) return false
    
    // Event Validation
    if (options?.eventId) {
        if (!this.validateEvent(entity, options.eventId)) {
            return false;
        }
    }

    // Calculate Chance
    const resistance = entity.getResistance(type);
    const chance = Math.max(0, Math.min(1, baseChance * (1 - resistance)));
    
    // Roll
    if (Math.random() > chance) {
        console.log(`🛡️ RESIST: ${entity.id} resisted '${type}' (Chance: ${(chance*100).toFixed(1)}%, Resistance: ${(resistance*100).toFixed(1)}%)`);
        return false;
    }
    
    // Status Logic
    const now = Date.now()
    const currentStatus = entity.battleStatuses.get(type)
    
    if (currentStatus) {
        // Extend duration
        currentStatus.expiresAt = Math.max(currentStatus.expiresAt, now + duration)
        // Update value/interval if provided (could be smarter logic here, e.g. overwrite vs stack)
        // For now, we overwrite with latest application values if provided
        if (options?.value !== undefined) currentStatus.value = options.value
        if (options?.interval !== undefined) currentStatus.interval = options.interval
        if (options?.sourceId !== undefined) currentStatus.sourceId = options.sourceId
        
        console.log(`✨ STATUS REFRESH: ${entity.id} refreshed '${type}' for ${duration}ms`)
    } else {
        // Create new
        const newStatus = new BattleStatus(
            `${type}-${now}`, // ID
            type,
            duration,
            options?.sourceId,
            options?.value,
            options?.interval
        )
        entity.battleStatuses.set(type, newStatus)
        console.log(`✨ STATUS: ${entity.id} applied '${type}' for ${duration}ms (Val: ${options?.value}, Int: ${options?.interval})`)
    }
    
    return true
  }

  // Validate if event should be processed
  // Returns TRUE if event is new and should process
  // Returns FALSE if event was already processed
  // Validate if event should be processed
  // Returns TRUE if event is new and should process
  // Returns FALSE if event was already processed
  private validateEvent(entity: WorldLife, eventId: string): boolean {
      let entityEvents = this.processedEventsByEntityId.get(entity.id);
      if (!entityEvents) {
          entityEvents = new Map<string, number>();
          this.processedEventsByEntityId.set(entity.id, entityEvents);
      }
      
      if (entityEvents.has(eventId)) {
          return false;
      }
      entityEvents.set(eventId, Date.now());
      return true;
  }

  // Cleanup processed events (call this periodically)
  cleanupProcessedEvents(entityId: string) {
      const entityEvents = this.processedEventsByEntityId.get(entityId);
      if (!entityEvents) return;

      const now = Date.now();
      const expiration = 2000; // 2 seconds retention
      
      const toRemove: string[] = [];
      entityEvents.forEach((timestamp, id) => {
          if (now - timestamp > expiration) {
              toRemove.push(id);
          }
      });
      
      toRemove.forEach(id => entityEvents.delete(id));
      
      // If empty, remove the entity map entirely to save memory
      if (entityEvents.size === 0) {
          this.processedEventsByEntityId.delete(entityId);
      }
  }

  // Helper to trigger cleanup globally
  cleanupAllEvents() {
      const now = Date.now();
      if (now - this.lastCleanupTime < this.processedIdsCleanupInterval) return;
      this.lastCleanupTime = now;
      
      // Iterate all tracked entities
      for (const entityId of this.processedEventsByEntityId.keys()) {
          this.cleanupProcessedEvents(entityId);
      }
  }

  // Trigger invulnerability frames - REMOVED/DEPRECATED
  triggerInvulnerability(entity: WorldLife, duration: number): void {
    // No-op
  }

  // Respawn an entity
  respawnEntity(entity: WorldLife, x?: number, y?: number): void {
    entity.isAlive = true
    entity.currentHealth = entity.maxHealth
    entity.isAttacking = false
    entity.attackAnimationStartTime = 0 // Reset animation timestamp
    entity.isMoving = false
    entity.vx = 0
    entity.vy = 0
    entity.lastAttackTime = 0
    entity.attackCooldown = 0

    this.processedEventsByEntityId.delete(entity.id) // Clear old events on respawn
    // entity.isInvulnerable = false // Removed
    // entity.invulnerabilityDuration = 0 // Removed

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


    }
  }

  // Update entity combat state (cooldowns)
  updateCombatState(entity: WorldLife, deltaTime: number): void {
    // Invulnerability update removed
    
    // Periodically cleanup events? Or do it in main loop.
    // For now we'll do global cleanup in loop.

    // Update attack cooldown
    if (entity.attackCooldown > 0) {
      entity.attackCooldown -= deltaTime
    }

    // Process Status Effects (DOTs etc)
    this.processStatusTicks(entity);
  }

  // Process status ticks (DOTs)
  processStatusTicks(entity: WorldLife): void {
      if (!entity.isAlive || !entity.battleStatuses) return;
      
      const now = Date.now();
      
      entity.battleStatuses.forEach((status) => {
          // Check if it has an interval (is a DOT/HOT)
          if (status.interval > 0) {
              // Check if ready to tick
              if (now - status.lastTick >= status.interval) {
                  // Apply Effect
                  // TODO: Use a map of handlers for different types?
                  // For now, hardcode 'burn', 'poison', 'regen' logic or generic 'damage'/'heal'
                  
                  if (status.type === 'burn' || status.type === 'poison') {
                      this.applyDamage(entity, status.value);
                      console.log(`🔥 DOT: ${entity.id} took ${status.value} damage from ${status.type}`);
                  } else if (status.type === 'regen') {
                      this.healEntity(entity, status.value);
                  }
                  
                  status.lastTick = now;
              }
          }
      });
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
  // Supports attacks without targets (for visual feedback/practice swings)
  private handleAttackMessage(
    actor: WorldLife,
    target: WorldLife | null,
    payload: AttackActionPayload
  ): boolean {
    if (!target) {
      // No target - just update attack state for visual feedback
      // This allows players to "swing" their weapon even without hitting anything
      actor.lastAttackTime = performance.now()
      actor.isAttacking = true
      actor.attackAnimationStartTime = performance.now()
      console.log(`📨 BATTLE: ${actor.id} attacking (no target) - attack animation triggered`)
      return true
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
