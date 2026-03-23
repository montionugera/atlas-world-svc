import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { GameState } from '../schemas/GameState'
import { WorldLife } from '../schemas/WorldLife'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { AttackDefinition } from '../config/mobTypesConfig'
import { eventBus, RoomEventType, BattleAttackData } from '../events/EventBus'
import { MOB_STATS } from '../config/combatConfig'
import { resolveMeleeAttackTiming } from '../combat/meleeAttackSpeed'

import { BaseCombatSystem } from './BaseCombatSystem'

function getTargetFromGameState(gameState: GameState, id: string): WorldLife | undefined {
  return gameState.players.get(id) ?? gameState.npcs.get(id)
}

export class MobCombatSystem extends BaseCombatSystem<Mob> {
  constructor(mob: Mob) {
    super(mob)
  }

  // Helper alias for backward compatibility or convenience
  private get mob(): Mob {
    return this.entity
  }

  private windUpMsForAttack(attack: AttackDefinition): number {
    const timing = resolveMeleeAttackTiming(this.mob.agi, attack.aspdMin, attack.aspdMax)
    return timing?.windUpMs ?? attack.atkWindUpTime
  }

  /**
   * Main update loop for combat logic. Target can be player or NPC (from gameState.players or gameState.npcs).
   */
  update(
    deltaTime: number,
    gameState: GameState,
    roomId: string
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } {
    if (this.mob.currentBehavior !== 'attack' || !this.mob.currentAttackTarget) {
      return { attacked: false }
    }

    const target = getTargetFromGameState(gameState, this.mob.currentAttackTarget)
    if (!target || !target.isAlive) {
      this.mob.currentAttackTarget = ''
      this.mob.currentBehavior = 'wander'
      this.mob.isCasting = false
      this.mob.castStartTime = 0
      return { attacked: false }
    }

    this.mob.targetX = target.x
    this.mob.targetY = target.y

    if (this.mob.attackStrategies.length > 0) {
      return this.updateAttackWithStrategies(target, roomId, gameState)
    }

    if (!this.canAttack()) {
      return { attacked: false }
    }

    const distanceToTarget = this.mob.getDistanceTo(target)
    const effectiveMeleeRange = this.mob.attackRange + this.mob.radius + target.radius
    if (distanceToTarget > effectiveMeleeRange) {
      console.log(
        `🎯 MOB ${this.mob.id}: Target out of range (${distanceToTarget.toFixed(2)} > ${effectiveMeleeRange.toFixed(2)}), switching to chase`
      )
      this.mob.currentBehavior = 'chase'
      this.mob.currentChaseTarget = this.mob.currentAttackTarget
      this.mob.currentAttackTarget = ''
      return { attacked: false }
    }

    const attackData: BattleAttackData = {
      actorId: this.mob.id,
      targetId: target.id,
      damage: this.mob.pAtk,
      range: this.mob.attackRange,
      roomId: roomId
    }
    eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData)
    console.log(`📡 MOB ${this.mob.id} emitted battle attack event for ${target.id}`)

    this.mob.lastAttackTime = performance.now()
    return { attacked: true, targetId: target.id, eventEmitted: true }
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
          const fireTime = currentTime + this.windUpMsForAttack(attack)
          
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
             this.mob.castDuration = firstAttack.executionTime - this.mob.castStartTime
             this.mob.currentAttackStrategy = strategy
             this.mob.isAttacking = false
          }
      }
  }

  // Process the attack queue (target can be player or NPC)
  private processAttackQueue(gameState: GameState, roomId: string): { attacked: boolean; targetId?: string; eventEmitted?: boolean } | null {
      if (this.mob.attackQueue.length === 0) return null

      const now = Date.now()
      const nextAttack = this.mob.attackQueue[0]

      if (now >= nextAttack.executionTime) {
          this.mob.attackQueue.shift()

          const target = getTargetFromGameState(gameState, nextAttack.targetId)
          if (target) { 
               if (typeof (nextAttack.strategy as any).performAttack === 'function') {
                   (nextAttack.strategy as any).performAttack(this.mob, target, nextAttack.attackDef)
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
                   const timing = resolveMeleeAttackTiming(
                     this.mob.agi,
                     nextAttack.attackDef.aspdMin,
                     nextAttack.attackDef.aspdMax
                   )
                   if (timing) {
                     this.mob.attackDelay = timing.attackDelayMs
                   } else {
                     const windUp = nextAttack.attackDef.atkWindUpTime || 0
                     this.mob.attackDelay = windUp + this.mob.baseWindDownTime
                   }
               }
          }

          // Update State for NEXT attack
          if (this.mob.attackQueue.length > 0) {
              // Still have attacks pending
              this.mob.isCasting = true
              this.mob.castStartTime = now // Start casting the next one
              this.mob.castDuration = this.mob.attackQueue[0].executionTime - now
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

  // Update attack using attack strategies (target can be player or NPC)
  private updateAttackWithStrategies(
    target: WorldLife,
    roomId: string,
    gameState: GameState
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } {
    const currentTimeMs = Date.now()
    const currentTimePerf = performance.now()

    const queueResult = this.processAttackQueue(gameState, roomId)
    if (queueResult !== null) {
        return queueResult
    }

    const castingResult = this.checkWindUpPhase(target, roomId)
    if (castingResult !== null) {
      return castingResult
    }

    const strategiesByPriority = this.sortStrategiesByPriority(this.mob.attackStrategies, target)

    const isCooldownReady = this.canAttack()
    const cooldownStateChanged = isCooldownReady !== this.mob.lastCooldownState
    const shouldLogDebug = cooldownStateChanged && isCooldownReady

    if (shouldLogDebug) {
      const distance = this.mob.getDistanceTo(target)
      console.log(`🔍 DEBUG: ${this.mob.id} cooldown ready, checking ${strategiesByPriority.length} strategies`)
      this.mob.lastCooldownState = isCooldownReady
    }

    for (const strategy of strategiesByPriority) {
      const result = strategy.attemptExecute(this.mob, target as Player, roomId)

      if (!result.canExecute) {
        continue
      }

      if (shouldLogDebug) {
        const distance = this.mob.getDistanceTo(target)
        const range = this.getStrategyRange(strategy, target as Player)
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

    if (this.checkTargetOutOfRange(target)) {
      return { attacked: false }
    }

    if (cooldownStateChanged) {
      this.mob.lastCooldownState = isCooldownReady
    }
    
    return { attacked: false }
  }

  private checkTargetOutOfRange(target: WorldLife): boolean {
    if (this.mob.isCasting) return false

    const distance = this.mob.getDistanceTo(target)
    const edgeToEdgeDistance = Math.max(0, distance - this.mob.radius - (target.radius || 4))

    const maxRange = Math.max(
      ...this.mob.attackStrategies.map(s => this.getStrategyRange(s, target as Player))
    )
    
    if (edgeToEdgeDistance > maxRange) {
      console.log(`🎯 DEBUG: ${this.mob.id} target out of range (${edgeToEdgeDistance.toFixed(2)} > ${maxRange.toFixed(2)}), switching to chase`)
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

  public getStrategyRange(strategy: AttackStrategy, target: WorldLife): number {
    if (strategy.name === 'melee') {
      return this.mob.attackRange + this.mob.radius + target.radius
    }
    return (strategy as any).maxRange || this.mob.attackRange
  }

  private sortStrategiesByPriority(strategies: AttackStrategy[], target: WorldLife): AttackStrategy[] {
    return [...strategies].sort((a, b) => {
      // Instant attacks (0 cast time) have priority
      const aIsInstant = a.getCastTime(this.mob) === 0
      const bIsInstant = b.getCastTime(this.mob) === 0
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
    const castTime = strategy.getCastTime(this.mob)
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

  private checkWindUpPhase(
    target: WorldLife,
    roomId: string
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } | null {
    if (!this.mob.isCasting || this.mob.castStartTime === 0) return null

    const currentTimeMs = Date.now()
    const castDurationMs = this.mob.currentAttackStrategy?.getCastTime(this.mob) || 0
    const castElapsedMs = currentTimeMs - this.mob.castStartTime

    if (castElapsedMs >= castDurationMs) {
        if (!this.mob.currentAttackStrategy) return null

        console.log(`🎯 DEBUG: ${this.mob.id} windup complete, executing ${this.mob.currentAttackStrategy.name} attack`)
        const attackExecuted = this.mob.currentAttackStrategy.execute(this.mob, target as Player, roomId)

        if (attackExecuted) {
          this.mob.isCasting = false
          this.mob.castStartTime = 0
          this.mob.currentAttackStrategy = null
          this.mob.lastAttackTime = performance.now()
          this.mob.isAttacking = true
          this.mob.attackAnimationStartTime = performance.now()
          return { attacked: true, targetId: target.id, eventEmitted: true }
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
