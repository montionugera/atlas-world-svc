import { WorldLife } from '../schemas/WorldLife'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { AttackDefinition } from '../config/mobTypesConfig'
import { CombatantFields } from './CombatantFields'
import { processAttackQueue } from './attackQueue'

export type CombatResult = { attacked: boolean; targetId?: string; eventEmitted?: boolean }

export abstract class BaseCombatSystem<T extends WorldLife & CombatantFields> {
  protected entity: T

  constructor(entity: T) {
    this.entity = entity
  }

  /**
   * Check if the entity can perform an attack (Generic checks)
   */
  canAttack(): boolean {
    if (!this.entity.isAlive) return false
    if (this.entity.isStunned) return false
    // Additional checks can be added here
    return true
  }

  /**
   * Abstract method to be implemented by specific systems
   */
  abstract update(deltaTime: number, ...args: any[]): void

  /**
   * Helper to measure time consistently
   */
  protected now(): number {
    return performance.now()
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Hooks for the genuine Mob/NPC differences. These are the only seams the
  // shared scheduling logic varies on.
  // ───────────────────────────────────────────────────────────────────────────

  /** Resolve a target id against the relevant world collection. */
  protected abstract resolveTarget(id: string, world: any): WorldLife | undefined

  /** Fallback when the current attack target is gone (sets behavior/targets). */
  protected abstract onTargetLost(): void

  /** Effective range of a strategy against a target (per-subclass radius math). */
  public abstract getStrategyRange(strategy: AttackStrategy, target: WorldLife): number

  /** Wind-up ms for a queued attack (Mob: ASPD timing; NPC: raw atkWindUpTime). */
  protected abstract windUpMsForAttack(attack: AttackDefinition): number

  /** Next attackDelay to apply after a queued attack fires. */
  protected abstract nextAttackDelay(attackDef: AttackDefinition): number

  /**
   * Max number of due attacks to drain from the queue in a single update tick.
   * Default unbounded (NPC/Player drain every due attack, matching their
   * pre-refactor behavior). MobCombatSystem overrides this to 1 to preserve its
   * original one-attack-per-tick loop semantics.
   */
  protected maxAttacksPerTick(): number {
    return Infinity
  }

  // Optional debug-logging seams (default no-op; Mob overrides to preserve logs).
  protected onWindUpStarted(_strategy: AttackStrategy, _castTime: number): void {}
  protected onAttackingStarted(_currentTimeMs?: number): void {}
  protected onWindUpComplete(): void {}
  protected onWindUpExecuteFailed(): void {}

  // ───────────────────────────────────────────────────────────────────────────
  // Shared cast/queue scheduling — uses Date.now() (the deliberate two-clock
  // split: scheduling on Date.now() so jest fake timers can drive it; cooldown
  // on performance.now() via this.now()). Do NOT cross-subtract the two clocks.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Add a combo of attacks to the timeline and enter the casting state if the
   * first attack lands in the future.
   */
  public enqueueAttacks(
    strategy: AttackStrategy,
    targetId: string,
    attacks: AttackDefinition[],
    startTime: number
  ): void {
    this.entity.attackQueue = [] // Clear existing queue (new combo overrides old)
    let currentTime = startTime

    attacks.forEach(attack => {
      // Calculate when this attack should actually fire (end of its cast)
      const fireTime = currentTime + this.windUpMsForAttack(attack)

      this.entity.attackQueue.push({
        executionTime: fireTime,
        attackDef: attack,
        strategy: strategy,
        targetId: targetId,
      })

      // Next attack starts after this one finishes
      currentTime = fireTime
    })

    // Set initial casting state if we have a queue
    if (this.entity.attackQueue.length > 0) {
      const firstAttack = this.entity.attackQueue[0]
      // If the first attack is in the future, we are casting
      if (firstAttack.executionTime > Date.now()) {
        this.entity.isCasting = true
        this.entity.castStartTime = Date.now()
        this.entity.castDuration = firstAttack.executionTime - this.entity.castStartTime
        this.entity.currentAttackStrategy = strategy
        this.entity.isAttacking = false
      }
    }
  }

  /**
   * Drain every queued attack whose execution time has arrived, then update the
   * casting bookkeeping for the next pending item (or clear it when empty).
   *
   * @param world world collection passed to resolveTarget for each fired attack
   * @returns the last fired attack's result, a waiting result when items remain
   *          but none were due, or null when the queue is empty.
   */
  protected processAttackQueue(world: any): CombatResult | null {
    if (this.entity.attackQueue.length === 0) return null

    const now = Date.now()
    let lastResult: CombatResult | null = null

    const executed = processAttackQueue(
      this.entity.attackQueue,
      now,
      item => item.executionTime,
      item => {
        const target = this.resolveTarget(item.targetId, world)
        if (target) {
          if (typeof (item.strategy as any).performAttack === 'function') {
            ;(item.strategy as any).performAttack(this.entity, target, item.attackDef)
          } else {
            console.warn(
              `⚠️ ${this.entity.id}: Strategy ${item.strategy.name} does not support queued execution via performAttack`
            )
          }

          this.entity.lastAttackTime = performance.now()
          this.entity.isAttacking = true
          this.entity.attackAnimationStartTime = performance.now()
          this.entity.attackDelay = this.nextAttackDelay(item.attackDef)
        }
        lastResult = { attacked: true, targetId: item.targetId, eventEmitted: true }
      },
      this.maxAttacksPerTick()
    )

    this.applyPostQueueCastState(executed, now)

    return lastResult ?? (this.entity.attackQueue.length > 0 ? { attacked: false } : null)
  }

  /**
   * Update the casting bookkeeping after the queue has been drained.
   *
   * Default (Mob) semantics: only refresh the cast window when an attack
   * actually fired this tick. While merely waiting for the next attack, leave
   * castStartTime/castDuration untouched (just keep isCasting true), and do NOT
   * adopt the next item's strategy as currentAttackStrategy.
   *
   * NPCCombatSystem overrides this to refresh unconditionally and to adopt the
   * next item's strategy — preserving its pre-refactor behavior.
   *
   * @param executed number of attacks that fired this tick
   * @param now Date.now() captured at the start of processing
   */
  protected applyPostQueueCastState(executed: number, now: number): void {
    if (executed === 0) {
      // Waiting for the next attack time — keep casting, don't reschedule.
      this.entity.isCasting = true
      return
    }

    const next = this.entity.attackQueue[0]
    if (next) {
      this.entity.isCasting = true
      this.entity.castStartTime = now // Start casting the next one
      this.entity.castDuration = next.executionTime - now
    } else {
      this.entity.isCasting = false
      this.entity.currentAttackStrategy = null
    }
  }

  /** Order strategies: instant (0 cast) first, then by ascending effective range. */
  protected sortStrategiesByPriority(
    strategies: AttackStrategy[],
    target: WorldLife
  ): AttackStrategy[] {
    return [...strategies].sort((a, b) => {
      // Instant attacks (0 cast time) have priority
      const aIsInstant = a.getCastTime(this.entity) === 0
      const bIsInstant = b.getCastTime(this.entity) === 0
      if (aIsInstant && !bIsInstant) return -1
      if (!aIsInstant && bIsInstant) return 1

      // If same cast time, prefer shorter range
      const aRange = this.getStrategyRange(a, target)
      const bRange = this.getStrategyRange(b, target)
      return aRange - bRange
    })
  }

  /** State transition: start casting a strategy. */
  public startWindUp(strategy: AttackStrategy, currentTimeMs: number): void {
    const castTime = strategy.getCastTime(this.entity)
    this.onWindUpStarted(strategy, castTime)
    this.entity.isCasting = true
    this.entity.isAttacking = false
    this.entity.castStartTime = currentTimeMs
    this.entity.currentAttackStrategy = strategy
  }

  /** State transition: register an instant attack as executed. */
  protected startAttacking(_targetId?: string, currentTimeMs?: number): void {
    this.onAttackingStarted(currentTimeMs)
    this.entity.isAttacking = true
    this.entity.attackAnimationStartTime = performance.now()
    this.entity.lastAttackTime = performance.now()
    this.entity.lastCooldownState = false
  }

  /**
   * Advance an in-progress cast. Returns a result while still casting / on
   * execution, or null when there is no cast to advance (or execute failed).
   */
  protected checkWindUpPhase(target: WorldLife, roomId: string): CombatResult | null {
    if (!this.entity.isCasting || this.entity.castStartTime === 0) return null

    const currentTimeMs = Date.now()
    const castDurationMs = this.entity.currentAttackStrategy?.getCastTime(this.entity) || 0
    const castElapsedMs = currentTimeMs - this.entity.castStartTime

    if (castElapsedMs >= castDurationMs) {
      if (!this.entity.currentAttackStrategy) return null

      this.onWindUpComplete()
      const attackExecuted = this.entity.currentAttackStrategy.execute(
        this.entity,
        target as any,
        roomId
      )

      if (attackExecuted) {
        this.entity.isCasting = false
        this.entity.castStartTime = 0
        this.entity.currentAttackStrategy = null
        this.entity.lastAttackTime = performance.now()
        this.entity.isAttacking = true
        this.entity.attackAnimationStartTime = performance.now()
        return { attacked: true, targetId: target.id, eventEmitted: true }
      } else {
        this.onWindUpExecuteFailed()
        this.entity.isCasting = false
        this.entity.castStartTime = 0
        this.entity.currentAttackStrategy = null
        return null
      }
    }

    // Still casting
    return { attacked: false }
  }
}
