import { THREAT_CONFIG } from '../../config/combat/threat'

const LN2 = Math.LN2

interface ThreatEntry {
  /** Threat as of `stamp`; the live value is this decayed forward to `now`. */
  value: number
  stamp: number
}

/**
 * One mob's threat table. Pure data -- no world access, no ticking.
 *
 * Decay is applied lazily when a value is read rather than swept per-tick, so the
 * table costs nothing on ticks where nothing is hit.
 */
export class ThreatTable {
  private readonly entries = new Map<string, ThreatEntry>()
  private tauntedId: string | null = null
  private tauntedUntil = 0

  private decayed(entry: ThreatEntry, now: number): number {
    const dt = now - entry.stamp
    if (dt <= 0) return entry.value
    return entry.value * Math.exp((-LN2 * dt) / THREAT_CONFIG.halfLifeMs)
  }

  /** Drop the lowest-threat entry so the table stays bounded. */
  private evictLowest(now: number): void {
    let lowestId: string | null = null
    let lowestValue = Infinity
    for (const [id, entry] of this.entries) {
      const v = this.decayed(entry, now)
      if (v < lowestValue) {
        lowestValue = v
        lowestId = id
      }
    }
    if (lowestId !== null) this.entries.delete(lowestId)
  }

  add(options: { entityId: string; amount: number; now: number }): void {
    const { entityId, amount, now } = options
    if (amount <= 0) return

    const existing = this.entries.get(entityId)
    if (existing) {
      existing.value = this.decayed(existing, now) + amount
      existing.stamp = now
      return
    }

    if (this.entries.size >= THREAT_CONFIG.maxEntries) this.evictLowest(now)
    this.entries.set(entityId, { value: amount, stamp: now })
  }

  /**
   * Force this entity to the top of the table AND pin it for `tauntLockMs`.
   * The multiplier alone would be immediately contestable by a high-DPS player;
   * the lock is what makes a tank's taunt reliable.
   */
  taunt(options: { entityId: string; now: number }): void {
    const { entityId, now } = options

    let highest = 0
    for (const entry of this.entries.values()) {
      highest = Math.max(highest, this.decayed(entry, now))
    }

    const value = Math.max(highest * THREAT_CONFIG.tauntMultiplier, 1)
    if (!this.entries.has(entityId) && this.entries.size >= THREAT_CONFIG.maxEntries) {
      this.evictLowest(now)
    }
    this.entries.set(entityId, { value, stamp: now })

    this.tauntedId = entityId
    this.tauntedUntil = now + THREAT_CONFIG.tauntLockMs
  }

  isTauntLocked(options: { now: number }): boolean {
    return this.tauntedId !== null && options.now < this.tauntedUntil
  }

  tauntedTarget(options: { now: number }): string | null {
    return this.isTauntLocked(options) ? this.tauntedId : null
  }

  valueOf(options: { entityId: string; now: number }): number {
    const entry = this.entries.get(options.entityId)
    return entry ? this.decayed(entry, options.now) : 0
  }

  /** Highest-threat entity among `candidateIds`. Null when none of them has threat. */
  best(options: {
    candidateIds: string[]
    now: number
  }): { entityId: string; threat: number } | null {
    const { candidateIds, now } = options
    let bestId: string | null = null
    let bestThreat = 0

    for (const id of candidateIds) {
      const entry = this.entries.get(id)
      if (!entry) continue
      const v = this.decayed(entry, now)
      if (v > bestThreat) {
        bestThreat = v
        bestId = id
      }
    }

    return bestId === null ? null : { entityId: bestId, threat: bestThreat }
  }

  remove(options: { entityId: string }): void {
    this.entries.delete(options.entityId)
    if (this.tauntedId === options.entityId) {
      this.tauntedId = null
      this.tauntedUntil = 0
    }
  }

  size(): number {
    return this.entries.size
  }
}
