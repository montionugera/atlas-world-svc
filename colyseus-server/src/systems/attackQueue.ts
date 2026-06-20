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
 * @param maxItems cap on how many due items to drain this call (default: unbounded).
 *                 Mob passes 1 to preserve its original one-attack-per-tick loop;
 *                 NPC/Player leave it unbounded to drain every due attack.
 * @returns number of items executed
 */
export function processAttackQueue<T>(
  queue: T[],
  now: number,
  getExecuteTime: (item: T) => number,
  onExecute: (item: T) => void,
  maxItems = Infinity
): number {
  let executed = 0
  while (queue.length > 0 && executed < maxItems && now >= getExecuteTime(queue[0])) {
    const item = queue.shift()!
    onExecute(item)
    executed++
  }
  return executed
}
