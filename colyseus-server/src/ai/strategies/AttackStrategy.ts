import { Mob } from '../../schemas/Mob'
import { Player } from '../../schemas/Player'

/**
 * Result of attempting to execute an attack strategy
 */
export interface AttackExecutionResult {
  canExecute: boolean
  needsCasting: boolean // true if strategy needs casting phase before execution
  executed: boolean // true if attack was executed immediately
  targetId?: string
}

/**
 * Attack Strategy Interface
 * Allows mobs to have multiple attack types (melee, ranged, etc.)
 */
export interface AttackStrategy {
  name: string
  canExecute(mob: Mob, target: Player): boolean
  execute(mob: Mob, target: Player, roomId: string): boolean
  getCastTime(): number // ms before attack executes
  
  /**
   * Attempt to execute the strategy
   * Returns execution result indicating if casting is needed or if attack executed immediately
   */
  attemptExecute(mob: Mob, target: Player, roomId: string): AttackExecutionResult
}

