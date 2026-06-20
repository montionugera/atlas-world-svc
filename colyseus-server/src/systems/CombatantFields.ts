import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { AttackDefinition } from '../config/mobTypesConfig'

/**
 * Schema-side contract that BaseCombatSystem depends on.
 *
 * These are the combat fields the shared wind-up / attack-queue / scheduling
 * logic reads and writes. Both Mob and NPC already carry every field below, so
 * constraining `BaseCombatSystem<T extends WorldLife & CombatantFields>` adds no
 * new requirement — it just makes the dependency explicit and removes the need
 * for `as any` casts inside the base.
 */
export interface CombatantFields {
  attackQueue: {
    executionTime: number
    attackDef: AttackDefinition
    strategy: AttackStrategy
    targetId: string
  }[]
  castStartTime: number
  castDuration: number
  isCasting: boolean
  isAttacking: boolean
  attackAnimationStartTime: number
  currentAttackStrategy: AttackStrategy | null
  attackStrategies: AttackStrategy[]
  lastCooldownState: boolean
  baseWindDownTime: number
  lastAttackTime: number
  attackDelay: number
}
