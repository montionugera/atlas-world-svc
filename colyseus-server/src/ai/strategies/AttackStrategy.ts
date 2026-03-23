import { WorldLife } from '../../schemas/WorldLife'

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
  canExecute(attacker: any, target: any): boolean
  execute(attacker: any, target: any, roomId: string): boolean
  /** @param attacker Optional; strategies with ASPD bands use attacker.stat.agi when present. */
  getCastTime(attacker?: WorldLife): number // ms before attack executes
  
  /**
   * Attempt to execute the strategy
   * Returns execution result indicating if casting is needed or if attack executed immediately
   */
  attemptExecute(attacker: any, target: any, roomId: string): AttackExecutionResult
}

