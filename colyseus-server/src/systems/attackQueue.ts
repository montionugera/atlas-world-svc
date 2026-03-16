/**
 * Shared attack queue: execute scheduled attacks when now >= executeTime.
 * Used by both Player (single melee) and NPC (melee or ability queue).
 */

export interface ScheduledAttack {
  executeTime: number
  targetId?: string
  kind: 'melee' | 'ability'
  payload?: unknown
}

/**
 * Process queue: pop and execute each item where now >= executeTime.
 * @param queue mutable array (shift() used)
 * @param now current time (ms)
 * @param getExecuteTime extract execute time from item (for generic queue shapes)
 * @param onExecute called for each popped item
 * @returns number of items executed
 */
export function processAttackQueue<T>(
  queue: T[],
  now: number,
  getExecuteTime: (item: T) => number,
  onExecute: (item: T) => void
): number {
  let executed = 0
  while (queue.length > 0 && now >= getExecuteTime(queue[0])) {
    const item = queue.shift()!
    onExecute(item)
    executed++
  }
  return executed
}
