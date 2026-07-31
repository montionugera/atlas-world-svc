import { ThreatTable } from '../threat/ThreatTable'
import { THREAT_CONFIG } from '../../config/combat/threat'

export interface TargetCandidate {
  id: string
  distance: number
}

/**
 * Pick a target (F-023).
 *
 * Rules, in order:
 *   1. An active taunt wins outright, if its target is still a candidate.
 *   2. Otherwise the highest-threat candidate wins...
 *   3. ...unless the current target is still within `switchMargin`, in which case
 *      it is held. Without this, two similarly-threatening players flip the target
 *      every tick.
 *   4. With no threat at all, fall back to NEAREST -- byte-identical to pre-F-023
 *      behaviour, which is what keeps the blast radius survivable.
 *
 * Pure: no world access, no mutation. Cost is O(candidates), the same as the
 * nearest-scan it replaces.
 */
export function selectTarget(options: {
  candidates: TargetCandidate[]
  table: ThreatTable | null
  currentTargetId: string
  now: number
}): TargetCandidate | null {
  const { candidates, table, currentTargetId, now } = options
  if (candidates.length === 0) return null

  const nearest = (): TargetCandidate =>
    candidates.reduce((best, c) => (c.distance < best.distance ? c : best))

  if (!table) return nearest()

  // Rule 1 -- taunt.
  const taunted = table.tauntedTarget({ now })
  if (taunted !== null) {
    const match = candidates.find(c => c.id === taunted)
    if (match) return match
  }

  // Rule 2 -- highest threat.
  const best = table.best({ candidateIds: candidates.map(c => c.id), now })
  if (best === null) return nearest() // Rule 4

  // Rule 3 -- hysteresis: hold the incumbent unless clearly beaten.
  if (currentTargetId !== '' && currentTargetId !== best.entityId) {
    const incumbent = candidates.find(c => c.id === currentTargetId)
    if (incumbent) {
      const incumbentThreat = table.valueOf({ entityId: currentTargetId, now })
      if (incumbentThreat > 0 && best.threat < incumbentThreat * THREAT_CONFIG.switchMargin) {
        return incumbent
      }
    }
  }

  return candidates.find(c => c.id === best.entityId) ?? nearest()
}
