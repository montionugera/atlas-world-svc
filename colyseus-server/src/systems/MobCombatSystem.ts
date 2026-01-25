import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { AttackDefinition } from '../config/mobTypesConfig'
import { eventBus, RoomEventType, BattleAttackData } from '../events/EventBus'
import { MOB_STATS } from '../config/combatConfig'

import { BaseCombatSystem } from './BaseCombatSystem'

export class MobCombatSystem extends BaseCombatSystem<Mob> {
  constructor(mob: Mob) {
    super(mob)
  }

  // Helper alias for backward compatibility or convenience
  private get mob(): Mob {
    return this.entity
  }

  /**
   * Main update loop for combat logic
   */
  update(
    deltaTime: number,
    players: Map<string, any>,
    roomId: string
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } {
    // Only process attacks if we're in attack behavior
    if (this.mob.currentBehavior !== 'attack' || !this.mob.currentAttackTarget) {
      return { attacked: false }
    }

    const targetPlayer = players.get(this.mob.currentAttackTarget)
    if (!targetPlayer || !targetPlayer.isAlive) {
      // Target is dead or doesn't exist, clear attack target
      this.mob.currentAttackTarget = ''
      this.mob.currentBehavior = 'wander' // Fallback to wander
      this.mob.isCasting = false
      this.mob.castStartTime = 0
      return { attacked: false }
    }

    // Update target position directly on mob (used by movement system)
    this.mob.targetX = targetPlayer.x
    this.mob.targetY = targetPlayer.y

    // Use attack strategies if available
    if (this.mob.attackStrategies.length > 0) {
      return this.updateAttackWithStrategies(targetPlayer, roomId, players)
    }

    // Legacy behavior: melee attack (for backward compatibility)
    if (!this.canAttack()) {
      return { attacked: false }
    }

    const distanceToTargetPlayer = this.mob.getDistanceTo(targetPlayer)
    const effectiveMeleeRange = this.mob.attackRange + this.mob.radius + targetPlayer.radius
    if (distanceToTargetPlayer > effectiveMeleeRange) {
      // Target moved out of range, switch to chase behavior
      console.log(
        `🎯 MOB ${this.mob.id}: Target out of range (${distanceToTargetPlayer.toFixed(2)} > ${effectiveMeleeRange.toFixed(2)}), switching to chase`
      )
      this.mob.currentBehavior = 'chase'
      this.mob.currentChaseTarget = this.mob.currentAttackTarget
      this.mob.currentAttackTarget = ''
      return { attacked: false }
    }

    // Emit attack event - let BattleManager handle all battle logic
    const attackData: BattleAttackData = {
      actorId: this.mob.id,
      targetId: targetPlayer.id,
      damage: this.mob.attackDamage,
      range: this.mob.attackRange,
      roomId: roomId
    }

    // Emit the battle attack event
    eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData)
    console.log(
      `📡 MOB ${this.mob.id} emitted battle attack event for ${targetPlayer.id}`
    )

    // Update cooldown
    this.mob.lastAttackTime = performance.now()
    
    return { attacked: true, targetId: targetPlayer.id, eventEmitted: true }
  }

  /**
   * Check if mob can attack (cooldown check)
   */
  canAttack(): boolean {
      if (!this.mob.isAlive) return false
      // Cannot attack if frozen or stunned
      if (this.mob.isStunned) return false
  
      const now = performance.now()
      const timeSinceLastAttack = now - this.mob.lastAttackTime
  
      return timeSinceLastAttack >= this.mob.attackDelay
  }

  /**
   * Add attacks to the timeline
   */
  public enqueueAttacks(
      strategy: AttackStrategy, 
      targetId: string, 
      attacks: AttackDefinition[], 
      startTime: number
  ): void {
      this.mob.attackQueue = [] // Clear existing queue (new combo overrides old)
      let currentTime = startTime

      attacks.forEach((attack, index) => {
          // Calculate when this attack should actually fire (end of its cast)
          const fireTime = currentTime + attack.atkWindUpTime
          
          this.mob.attackQueue.push({
              executionTime: fireTime,
              attackDef: attack,
              strategy: strategy,
              targetId: targetId
          })

          // Next attack starts after this one finishes
          currentTime = fireTime
      })

      // Set initial casting state if we have a queue
      if (this.mob.attackQueue.length > 0) {
          const firstAttack = this.mob.attackQueue[0]
          // If the first attack is in the future, we are casting
          if (firstAttack.executionTime > Date.now()) {
             this.mob.isCasting = true
             this.mob.castStartTime = Date.now()
             this.mob.currentAttackStrategy = strategy
             this.mob.isAttacking = false
          }
      }
  }

  // Process the attack queue
  private processAttackQueue(players: Map<string, any>, roomId: string): { attacked: boolean; targetId?: string; eventEmitted?: boolean } | null {
      if (this.mob.attackQueue.length === 0) return null

      const now = Date.now()
      const nextAttack = this.mob.attackQueue[0] // Peek

      // Check if it's time to fire
      if (now >= nextAttack.executionTime) {
          // Dequeue
          this.mob.attackQueue.shift()
          
          const targetPlayer = players.get(nextAttack.targetId) as Player
          if (targetPlayer /* && targetPlayer.isAlive */) { 
               // Execute
               if (typeof (nextAttack.strategy as any).performAttack === 'function') {
                   (nextAttack.strategy as any).performAttack(this.mob, targetPlayer, nextAttack.attackDef)
               } else {
                   console.warn(`⚠️ Mob ${this.mob.id}: Strategy ${nextAttack.strategy.name} does not support queued execution via performAttack`)
               }

               this.mob.lastAttackTime = performance.now()
               this.mob.isAttacking = true
               this.mob.attackAnimationStartTime = performance.now()

               // Update attack delay for the NEXT attack cycle based on this attack's cooldown
               if (nextAttack.attackDef.cooldown !== undefined) {
                   this.mob.attackDelay = nextAttack.attackDef.cooldown
               } else {
                   const windUp = nextAttack.attackDef.atkWindUpTime || 0
                   this.mob.attackDelay = windUp + this.mob.baseWindDownTime
               }
          }

          // Update State for NEXT attack
          if (this.mob.attackQueue.length > 0) {
              // Still have attacks pending
              this.mob.isCasting = true
              this.mob.castStartTime = now // Start casting the next one
          } else {
              // Queue empty
              this.mob.isCasting = false
              this.mob.currentAttackStrategy = null
          }

          return { attacked: true, targetId: nextAttack.targetId, eventEmitted: true }
      } else {
          // Waiting for attack time
          this.mob.isCasting = true // Ensure casting is true while waiting
          return { attacked: false }
      }
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
        return queueResult
    }

    // Check casting phase first (Legacy/Fallback for non-queue strategies)
    const castingResult = this.checkWindUpPhase(targetPlayer, roomId)
    if (castingResult !== null) {
      return castingResult
    }

    // Sort strategies by priority
    const strategiesByPriority = this.sortStrategiesByPriority(this.mob.attackStrategies, targetPlayer)
    
    // Check cooldown and prepare debug logging
    const isCooldownReady = this.canAttack()
    const cooldownStateChanged = isCooldownReady !== this.mob.lastCooldownState
    const shouldLogDebug = cooldownStateChanged && isCooldownReady
    
    if (shouldLogDebug) {
      const cooldownElapsed = currentTimePerf - this.mob.lastAttackTime
      const distance = this.mob.getDistanceTo(targetPlayer)
      console.log(`🔍 DEBUG: ${this.mob.id} cooldown ready, checking ${strategiesByPriority.length} strategies`)
      this.mob.lastCooldownState = isCooldownReady
    }
    
    // Try each strategy in priority order
    for (const strategy of strategiesByPriority) {
      const result = strategy.attemptExecute(this.mob, targetPlayer, roomId)
      
      if (!result.canExecute) {
        continue // Try next strategy
      }

      // Log strategy details if debug logging is enabled
      if (shouldLogDebug) {
        const distance = this.mob.getDistanceTo(targetPlayer)
        const range = this.getStrategyRange(strategy, targetPlayer)
        console.log(`  🔍 Strategy "${strategy.name}": canExecute=true, distance=${distance.toFixed(2)}, effectiveRange=${range.toFixed(2)}`)
      }

      // Apply state transitions based on strategy result
      if (result.needsCasting) {
        this.startWindUp(strategy, currentTimeMs)
        return { attacked: false }
      } else if (result.executed) {
        this.startAttacking(result.targetId, currentTimeMs)
        return { attacked: true, targetId: result.targetId, eventEmitted: true }
      }
    }

    // No strategy can execute - check if target out of range
    if (this.checkTargetOutOfRange(targetPlayer)) {
      return { attacked: false }
    }

    if (cooldownStateChanged) {
      this.mob.lastCooldownState = isCooldownReady
    }
    
    return { attacked: false }
  }

  // Helper: Check if target is out of attack range
  private checkTargetOutOfRange(targetPlayer: Player): boolean {
    // If we are currently casting, DO NOT check range or switch behavior
    if (this.mob.isCasting) return false

    const distance = this.mob.getDistanceTo(targetPlayer)
    const maxRange = Math.max(
      ...this.mob.attackStrategies.map(s => this.getStrategyRange(s, targetPlayer))
    )
    
    if (distance > maxRange) {
      console.log(`🎯 DEBUG: ${this.mob.id} target out of range (${distance.toFixed(2)} > ${maxRange.toFixed(2)}), switching to chase`)
      this.mob.currentBehavior = 'chase'
      this.mob.currentChaseTarget = this.mob.currentAttackTarget
      this.mob.currentAttackTarget = ''
      this.mob.isCasting = false
      this.mob.castStartTime = 0
      this.mob.lastCooldownState = false
      return true
    }
    return false
  }

  // Helper: Get strategy's effective range
  public getStrategyRange(strategy: AttackStrategy, target: Player): number {
    if (strategy.name === 'melee') {
      return this.mob.attackRange + this.mob.radius + target.radius
    }
    return (strategy as any).maxRange || this.mob.attackRange
  }

  // Helper: Sort strategies by priority
  private sortStrategiesByPriority(strategies: AttackStrategy[], target: Player): AttackStrategy[] {
    return [...strategies].sort((a, b) => {
      // Instant attacks (0 cast time) have priority
      const aIsInstant = a.getCastTime() === 0
      const bIsInstant = b.getCastTime() === 0
      if (aIsInstant && !bIsInstant) return -1
      if (!aIsInstant && bIsInstant) return 1
      
      // If same cast time, prefer shorter range
      const aRange = this.getStrategyRange(a, target)
      const bRange = this.getStrategyRange(b, target)
      return aRange - bRange
    })
  }

  // State transition: Start casting
  public startWindUp(strategy: AttackStrategy, currentTimeMs: number): void {
    const castTime = strategy.getCastTime()
    console.log(`⏳ DEBUG: ${this.mob.id} starting windup for ${strategy.name} (${castTime}ms)`)
    this.mob.isCasting = true
    this.mob.isAttacking = false 
    this.mob.castStartTime = currentTimeMs
    this.mob.currentAttackStrategy = strategy
  }

  // State transition: Start attacking
  private startAttacking(targetId?: string, currentTimeMs?: number): void {
    console.log(`⚡ DEBUG: ${this.mob.id} executing instant attack`)
    this.mob.isAttacking = true
    this.mob.attackAnimationStartTime = performance.now()
    this.mob.lastAttackTime = performance.now()
    this.mob.lastCooldownState = false
    if (currentTimeMs !== undefined) {
      this.mob.lastDebugLogTime = currentTimeMs
    }
  }

  // Helper: Check if casting is complete
  private checkWindUpPhase(
    targetPlayer: Player,
    roomId: string
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } | null {
    if (!this.mob.isCasting || this.mob.castStartTime === 0) return null

    const currentTimeMs = Date.now()
    const castDurationMs = this.mob.currentAttackStrategy?.getCastTime() || 0
    const castElapsedMs = currentTimeMs - this.mob.castStartTime

    if (castElapsedMs >= castDurationMs) {
        if (!this.mob.currentAttackStrategy) return null

        console.log(`🎯 DEBUG: ${this.mob.id} windup complete, executing ${this.mob.currentAttackStrategy.name} attack`)
        const attackExecuted = this.mob.currentAttackStrategy.execute(this.mob, targetPlayer, roomId)
        
        if (attackExecuted) {
          this.mob.isCasting = false
          this.mob.castStartTime = 0
          this.mob.currentAttackStrategy = null
          this.mob.lastAttackTime = performance.now()
          this.mob.isAttacking = true
          this.mob.attackAnimationStartTime = performance.now()
          return { attacked: true, targetId: targetPlayer.id, eventEmitted: true }
        } else {
          console.log(`❌ DEBUG: ${this.mob.id} strategy.execute() returned false`)
          this.mob.isCasting = false
          this.mob.castStartTime = 0
          this.mob.currentAttackStrategy = null
          return null
        }
    }

    // Still casting
    return { attacked: false }
  }
}
