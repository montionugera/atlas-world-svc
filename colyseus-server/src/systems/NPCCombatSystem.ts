import { NPC } from '../schemas/NPC'
import { Mob } from '../schemas/Mob'
import { WorldLife } from '../schemas/WorldLife'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { AttackDefinition } from '../config/mobTypesConfig'
import { eventBus, RoomEventType, BattleAttackData } from '../events/EventBus'
import { BaseCombatSystem, CombatResult } from './BaseCombatSystem'
import { BehaviorState } from '../ai/behaviors/BehaviorState'

export class NPCCombatSystem extends BaseCombatSystem<NPC> {
  constructor(npc: NPC) {
    super(npc)
  }

  private get npc(): NPC {
    return this.entity
  }

  // ── Hooks for the NPC-specific seams ─────────────────────────────────────

  protected resolveTarget(id: string, world: Map<string, Mob>): WorldLife | undefined {
    return world.get(id)
  }

  // Lost-target fallback: chase the owner.
  protected onTargetLost(): void {
    this.npc.currentAttackTarget = ''
    this.npc.currentBehavior = BehaviorState.CHASE
    if (this.npc.ownerId) this.npc.currentChaseTarget = this.npc.ownerId
    this.npc.isCasting = false
    this.npc.castStartTime = 0
  }

  // NPC queues use the raw configured wind-up.
  protected windUpMsForAttack(attack: AttackDefinition): number {
    return attack.atkWindUpTime
  }

  // Next attackDelay after a queued attack fires (wind-up + wind-down fallback).
  protected nextAttackDelay(attackDef: AttackDefinition): number {
    if (attackDef.cooldown !== undefined) {
      return attackDef.cooldown
    }
    const windUp = attackDef.atkWindUpTime || 0
    return windUp + this.npc.baseWindDownTime
  }

  // NPC refreshes the cast window every tick (even while merely waiting) and
  // adopts the next queued item's strategy as currentAttackStrategy. This
  // preserves NPCCombatSystem's pre-refactor queue bookkeeping.
  protected applyPostQueueCastState(_executed: number, now: number): void {
    const next = this.npc.attackQueue[0]
    if (next) {
      this.npc.isCasting = true
      this.npc.castStartTime = now
      this.npc.castDuration = next.executionTime - now
      this.npc.currentAttackStrategy = next.strategy
    } else {
      this.npc.isCasting = false
      this.npc.currentAttackStrategy = null
    }
  }

  update(deltaTime: number, mobs: Map<string, Mob>, roomId: string): CombatResult {
    if (this.npc.currentBehavior !== BehaviorState.ATTACK || !this.npc.currentAttackTarget) {
      return { attacked: false }
    }

    const targetMob = mobs.get(this.npc.currentAttackTarget)
    if (!targetMob || !targetMob.isAlive) {
      this.onTargetLost()
      return { attacked: false }
    }

    this.npc.targetX = targetMob.x
    this.npc.targetY = targetMob.y

    if (this.npc.attackStrategies.length > 0) {
      return this.updateAttackWithStrategies(targetMob, roomId, mobs)
    }

    if (!this.canAttack()) {
      return { attacked: false }
    }

    const distanceToTarget = this.npc.getDistanceTo(targetMob)
    const effectiveMeleeRange = this.npc.attackRange + this.npc.radius + targetMob.radius

    if (distanceToTarget > effectiveMeleeRange) {
      this.npc.currentBehavior = BehaviorState.CHASE
      if (this.npc.ownerId) this.npc.currentChaseTarget = this.npc.ownerId
      this.npc.currentAttackTarget = ''
      return { attacked: false }
    }

    const attackData: BattleAttackData = {
      actorId: this.npc.id,
      targetId: targetMob.id,
      damage: this.npc.pAtk,
      range: this.npc.attackRange,
      roomId: roomId,
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

  private updateAttackWithStrategies(
    targetMob: Mob,
    roomId: string,
    mobs: Map<string, Mob>
  ): CombatResult {
    const currentTimeMs = Date.now()

    const queueResult = this.processAttackQueue(mobs)
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
      this.npc.currentBehavior = BehaviorState.CHASE
      if (this.npc.ownerId) this.npc.currentChaseTarget = this.npc.ownerId
      this.npc.currentAttackTarget = ''
      this.npc.isCasting = false
      this.npc.castStartTime = 0
      this.npc.lastCooldownState = false
      return true
    }
    return false
  }

  public getStrategyRange(strategy: AttackStrategy, target: WorldLife): number {
    if (strategy.name === 'melee') {
      return this.npc.attackRange + this.npc.radius + target.radius
    }
    return (strategy as any).maxRange || this.npc.attackRange
  }
}
