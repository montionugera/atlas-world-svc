import { NPC } from '../schemas/NPC'
import { Mob } from '../schemas/Mob'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { AttackDefinition } from '../config/mobTypesConfig'
import { eventBus, RoomEventType, BattleAttackData } from '../events/EventBus'
import { BaseCombatSystem } from './BaseCombatSystem'

export class NPCCombatSystem extends BaseCombatSystem<any> {
  constructor(npc: NPC) {
    super(npc)
  }

  private get npc(): NPC {
    return this.entity as NPC
  }

  update(
    deltaTime: number,
    mobs: Map<string, Mob>,
    roomId: string
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } {
    // NPC AI behavior for attacking is "npcAttack"
    if (this.npc.currentBehavior !== 'npcAttack' || !this.npc.currentAttackTarget) {
      return { attacked: false }
    }

    const targetMob = mobs.get(this.npc.currentAttackTarget)
    if (!targetMob || !targetMob.isAlive) {
      this.npc.currentAttackTarget = ''
      this.npc.currentBehavior = 'followPlayer' // Fallback
      this.npc.isCasting = false
      this.npc.castStartTime = 0
      return { attacked: false }
    }

    this.npc.targetX = targetMob.x
    this.npc.targetY = targetMob.y

    if (this.npc.attackStrategies.length > 0) {
      return this.updateAttackWithStrategies(targetMob, roomId, mobs)
    }

    // Basic Melee fallback
    if (!this.canAttack()) {
      return { attacked: false }
    }

    const distanceToTarget = this.npc.getDistanceTo(targetMob)
    const effectiveMeleeRange = this.npc.attackRange + this.npc.radius + targetMob.radius
    
    if (distanceToTarget > effectiveMeleeRange) {
      this.npc.currentBehavior = 'followPlayer'
      this.npc.currentChaseTarget = this.npc.ownerId
      this.npc.currentAttackTarget = ''
      return { attacked: false }
    }

    const attackData: BattleAttackData = {
      actorId: this.npc.id,
      targetId: targetMob.id,
      damage: this.npc.attackDamage,
      range: this.npc.attackRange,
      roomId: roomId
    }

    eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData)
    this.npc.lastAttackTime = performance.now()
    
    return { attacked: true, targetId: targetMob.id, eventEmitted: true }
  }

  canAttack(): boolean {
      if (!this.npc.isAlive) return false
      if (this.npc.isStunned) return false
  
      const now = performance.now()
      const timeSinceLastAttack = now - (this.npc.lastAttackTime || 0)
  
      return timeSinceLastAttack >= this.npc.attackDelay
  }

  public enqueueAttacks(
      strategy: AttackStrategy, 
      targetId: string, 
      attacks: AttackDefinition[], 
      startTime: number
  ): void {
      this.npc.attackQueue = []
      let currentTime = startTime

      attacks.forEach((attack, index) => {
          const fireTime = currentTime + attack.atkWindUpTime
          this.npc.attackQueue.push({
              executionTime: fireTime,
              attackDef: attack,
              strategy: strategy,
              targetId: targetId
          })
          currentTime = fireTime
      })

      if (this.npc.attackQueue.length > 0) {
          const firstAttack = this.npc.attackQueue[0]
          if (firstAttack.executionTime > Date.now()) {
             this.npc.isCasting = true
             this.npc.castStartTime = Date.now()
             this.npc.castDuration = firstAttack.executionTime - this.npc.castStartTime
             this.npc.currentAttackStrategy = strategy
             this.npc.isAttacking = false
          }
      }
  }

  private processAttackQueue(mobs: Map<string, Mob>, roomId: string): { attacked: boolean; targetId?: string; eventEmitted?: boolean } | null {
      if (this.npc.attackQueue.length === 0) return null

      const now = Date.now()
      const nextAttack = this.npc.attackQueue[0]

      if (now >= nextAttack.executionTime) {
          this.npc.attackQueue.shift()
          
          const targetMob = mobs.get(nextAttack.targetId)
          if (targetMob) { 
               if (typeof (nextAttack.strategy as any).performAttack === 'function') {
                   (nextAttack.strategy as any).performAttack(this.npc, targetMob, nextAttack.attackDef)
               }

               this.npc.lastAttackTime = performance.now()
               this.npc.isAttacking = true
               this.npc.attackAnimationStartTime = performance.now()

               if (nextAttack.attackDef.cooldown !== undefined) {
                   this.npc.attackDelay = nextAttack.attackDef.cooldown
               } else {
                   const windUp = nextAttack.attackDef.atkWindUpTime || 0
                   this.npc.attackDelay = windUp + this.npc.baseWindDownTime
               }
          }

          if (this.npc.attackQueue.length > 0) {
              this.npc.isCasting = true
              this.npc.castStartTime = now
              this.npc.castDuration = this.npc.attackQueue[0].executionTime - now
          } else {
              this.npc.isCasting = false
              this.npc.currentAttackStrategy = null
          }

          return { attacked: true, targetId: nextAttack.targetId, eventEmitted: true }
      } else {
          this.npc.isCasting = true
          return { attacked: false }
      }
  }

  private updateAttackWithStrategies(
    targetMob: Mob,
    roomId: string,
    mobs: Map<string, Mob>
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } {
    const currentTimeMs = Date.now()

    const queueResult = this.processAttackQueue(mobs, roomId)
    if (queueResult !== null) return queueResult
    const castingResult = this.checkWindUpPhase(targetMob, roomId)
    if (castingResult !== null) return castingResult

    const strategiesByPriority = this.sortStrategiesByPriority(this.npc.attackStrategies, targetMob)
    const isCooldownReady = this.canAttack()
    
    if (isCooldownReady !== this.npc.lastCooldownState) {
      this.npc.lastCooldownState = isCooldownReady
    }
    
    for (const strategy of strategiesByPriority) {
      // NOTE: AttemptExecute handles standard logic, we might need a unified attemptExecute that takes WorldLife
      // If we only have melee for NPC, this is fine
      const result = strategy.attemptExecute(this.npc, targetMob, roomId)
      
      if (!result.canExecute) continue

      if (result.needsCasting) {
        this.startWindUp(strategy, currentTimeMs)
        return { attacked: false }
      } else if (result.executed) {
        this.startAttacking(result.targetId, currentTimeMs)
        return { attacked: true, targetId: result.targetId, eventEmitted: true }
      }
    }

    if (this.checkTargetOutOfRange(targetMob)) {
      return { attacked: false }
    }
    
    return { attacked: false }
  }

  private checkTargetOutOfRange(targetMob: Mob): boolean {
    if (this.npc.isCasting) return false

    const distance = this.npc.getDistanceTo(targetMob)
    const maxRange = Math.max(
      ...this.npc.attackStrategies.map(s => this.getStrategyRange(s, targetMob))
    )
    
    if (distance > maxRange) {
      this.npc.currentBehavior = 'followPlayer'
      this.npc.currentChaseTarget = this.npc.ownerId
      this.npc.currentAttackTarget = ''
      this.npc.isCasting = false
      this.npc.castStartTime = 0
      this.npc.lastCooldownState = false
      return true
    }
    return false
  }

  public getStrategyRange(strategy: AttackStrategy, target: Mob): number {
    if (strategy.name === 'melee') {
      return this.npc.attackRange + this.npc.radius + target.radius
    }
    return (strategy as any).maxRange || this.npc.attackRange
  }

  private sortStrategiesByPriority(strategies: AttackStrategy[], target: Mob): AttackStrategy[] {
    return [...strategies].sort((a, b) => {
      const aIsInstant = a.getCastTime() === 0
      const bIsInstant = b.getCastTime() === 0
      if (aIsInstant && !bIsInstant) return -1
      if (!aIsInstant && bIsInstant) return 1
      return this.getStrategyRange(a, target) - this.getStrategyRange(b, target)
    })
  }

  public startWindUp(strategy: AttackStrategy, currentTimeMs: number): void {
    this.npc.isCasting = true
    this.npc.isAttacking = false 
    this.npc.castStartTime = currentTimeMs
    this.npc.currentAttackStrategy = strategy
  }

  private startAttacking(targetId?: string, currentTimeMs?: number): void {
    this.npc.isAttacking = true
    this.npc.attackAnimationStartTime = performance.now()
    this.npc.lastAttackTime = performance.now()
    this.npc.lastCooldownState = false
  }

  private checkWindUpPhase(
    targetMob: Mob,
    roomId: string
  ): { attacked: boolean; targetId?: string; eventEmitted?: boolean } | null {
    if (!this.npc.isCasting || this.npc.castStartTime === 0) return null

    const currentTimeMs = Date.now()
    const castDurationMs = this.npc.currentAttackStrategy?.getCastTime() || 0
    const castElapsedMs = currentTimeMs - this.npc.castStartTime

    if (castElapsedMs >= castDurationMs) {
        if (!this.npc.currentAttackStrategy) return null

        const attackExecuted = this.npc.currentAttackStrategy.execute(this.npc, targetMob, roomId)
        
        if (attackExecuted) {
          this.npc.isCasting = false
          this.npc.castStartTime = 0
          this.npc.currentAttackStrategy = null
          this.npc.lastAttackTime = performance.now()
          this.npc.isAttacking = true
          this.npc.attackAnimationStartTime = performance.now()
          return { attacked: true, targetId: targetMob.id, eventEmitted: true }
        } else {
          this.npc.isCasting = false
          this.npc.castStartTime = 0
          this.npc.currentAttackStrategy = null
          return null
        }
    }

    return { attacked: false }
  }
}
