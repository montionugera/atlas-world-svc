import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { GameState } from '../schemas/GameState'
import { WorldLife } from '../schemas/WorldLife'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { AttackDefinition } from '../config/mobTypesConfig'
import { eventBus, RoomEventType, BattleAttackData } from '../events/EventBus'
import { MOB_STATS } from '../config/combatConfig'
import { resolveMeleeAttackTiming } from '../combat/meleeAttackSpeed'

import { BaseCombatSystem, CombatResult } from './BaseCombatSystem'

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

  // ── Hooks for the Mob-specific seams ─────────────────────────────────────

  protected resolveTarget(id: string, world: GameState): WorldLife | undefined {
    return getTargetFromGameState(world, id)
  }

  // Lost-target fallback used when a queued/attack target is gone (dead/missing).
  protected onTargetLost(): void {
    this.mob.currentAttackTarget = ''
    this.mob.currentBehavior = 'wander'
    this.mob.isCasting = false
    this.mob.castStartTime = 0
  }

  // Mob queues use ASPD-derived wind-up (falls back to atkWindUpTime).
  protected windUpMsForAttack(attack: AttackDefinition): number {
    const timing = resolveMeleeAttackTiming(this.mob.stat.agi, attack.aspdMin, attack.aspdMax)
    return timing?.windUpMs ?? attack.atkWindUpTime
  }

  // Next attackDelay after a queued attack fires (ASPD timing, then wind-up + wind-down).
  protected nextAttackDelay(attackDef: AttackDefinition): number {
    if (attackDef.cooldown !== undefined) {
      return attackDef.cooldown
    }
    const timing = resolveMeleeAttackTiming(this.mob.stat.agi, attackDef.aspdMin, attackDef.aspdMax)
    if (timing) {
      return timing.attackDelayMs
    }
    const windUp = attackDef.atkWindUpTime || 0
    return windUp + this.mob.baseWindDownTime
  }

  // Mob processes at most one due attack per update() tick — preserving its
  // original hand-rolled loop (single `if (now >= executionTime) { shift; return }`).
  // NPC/Player keep the unbounded default and drain every due attack.
  protected maxAttacksPerTick(): number {
    return 1
  }

  // Debug-log seams (preserve Mob's existing log output).
  protected onWindUpStarted(strategy: AttackStrategy, castTime: number): void {
    console.log(`⏳ DEBUG: ${this.mob.id} starting windup for ${strategy.name} (${castTime}ms)`)
  }

  protected onAttackingStarted(currentTimeMs?: number): void {
    console.log(`⚡ DEBUG: ${this.mob.id} executing instant attack`)
    if (currentTimeMs !== undefined) {
      this.mob.lastDebugLogTime = currentTimeMs
    }
  }

  protected onWindUpComplete(): void {
    console.log(`🎯 DEBUG: ${this.mob.id} windup complete, executing ${this.mob.currentAttackStrategy?.name} attack`)
  }

  protected onWindUpExecuteFailed(): void {
    console.log(`❌ DEBUG: ${this.mob.id} strategy.execute() returned false`)
  }

  /**
   * Main update loop for combat logic. Target can be player or NPC (from gameState.players or gameState.npcs).
   */
  update(
    deltaTime: number,
    gameState: GameState,
    roomId: string
  ): CombatResult {
    if (this.mob.currentBehavior !== 'attack' || !this.mob.currentAttackTarget) {
      return { attacked: false }
    }

    const target = getTargetFromGameState(gameState, this.mob.currentAttackTarget)
    if (!target || !target.isAlive) {
      this.onTargetLost()
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

  // Update attack using attack strategies (target can be player or NPC)
  private updateAttackWithStrategies(
    target: WorldLife,
    roomId: string,
    gameState: GameState
  ): CombatResult {
    // Timing-clock convention (intentional — do not "unify" without rewriting the tests):
    //   • Cast/queue scheduling uses Date.now() so the jest fake-timer suite
    //     (jest.useFakeTimers + setSystemTime) can drive it deterministically.
    //   • Cooldown anti-spam (lastAttackTime / canAttack) uses performance.now()
    //     for monotonic real-time precision.
    // The two clocks are never cross-subtracted, so they stay independently consistent.
    const currentTimeMs = Date.now()

    const queueResult = this.processAttackQueue(gameState)
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
}
