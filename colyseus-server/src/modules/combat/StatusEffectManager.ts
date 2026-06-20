/**
 * StatusEffectManager - status effect application + DOT/HOT ticks
 * Extracted verbatim from BattleModule (applyStatusEffect / processStatusTicks).
 *
 * Dependencies are injected because:
 *  - applyStatusEffect validates eventIds (via the shared ProcessedEventTracker)
 *  - processStatusTicks applies damage/heal, which handle entity death — the
 *    injected applyDamage MUST route to BattleModule's real applyDamage so the
 *    die() path still fires identically.
 *
 * Preserves Math.random() chance roll, resistance math, and Date.now() timestamps
 * in BattleStatus exactly as before.
 */
import { WorldLife } from '../../schemas/WorldLife'
import { BattleStatus } from '../../schemas/BattleStatus'
import { ProcessedEventTracker } from './ProcessedEventTracker'

export class StatusEffectManager {
  constructor(
    private tracker: ProcessedEventTracker,
    private applyDamage: (e: WorldLife, amount: number) => boolean,
    private healEntity: (e: WorldLife, amount: number) => boolean,
  ) {}

  // Apply a status effect to an entity
  applyStatusEffect(entity: WorldLife, type: string, duration: number, baseChance: number = 1.0, options?: {
      bypassInvulnerability?: boolean,
      eventId?: string,
      sourceId?: string,
      value?: number,
      interval?: number
  }): boolean {
    if (!entity.isAlive) return false

    // Event Validation
    if (options?.eventId) {
        if (!this.tracker.validate(entity.id, options.eventId)) {
            return false;
        }
    }

    // Calculate Chance
    const resistance = entity.getResistance(type);
    const chance = Math.max(0, Math.min(1, baseChance * (1 - resistance)));

    // Roll
    if (Math.random() > chance) {
        console.log(`🛡️ RESIST: ${entity.id} resisted '${type}' (Chance: ${(chance*100).toFixed(1)}%, Resistance: ${(resistance*100).toFixed(1)}%)`);
        return false;
    }

    // Status Logic
    const now = Date.now()
    const currentStatus = entity.battleStatuses.get(type)

    if (currentStatus) {
        // Extend duration
        currentStatus.expiresAt = Math.max(currentStatus.expiresAt, now + duration)
        // Update value/interval if provided (could be smarter logic here, e.g. overwrite vs stack)
        // For now, we overwrite with latest application values if provided
        if (options?.value !== undefined) currentStatus.value = options.value
        if (options?.interval !== undefined) currentStatus.interval = options.interval
        if (options?.sourceId !== undefined) currentStatus.sourceId = options.sourceId

        console.log(`✨ STATUS REFRESH: ${entity.id} refreshed '${type}' for ${duration}ms`)
    } else {
        // Create new
        const newStatus = new BattleStatus(
            `${type}-${now}`, // ID
            type,
            duration,
            options?.sourceId,
            options?.value,
            options?.interval
        )
        entity.battleStatuses.set(type, newStatus)
        console.log(`✨ STATUS: ${entity.id} applied '${type}' for ${duration}ms (Val: ${options?.value}, Int: ${options?.interval})`)
    }

    return true
  }

  // Process status ticks (DOTs)
  processStatusTicks(entity: WorldLife): void {
      if (!entity.isAlive || !entity.battleStatuses) return;

      const now = Date.now();

      entity.battleStatuses.forEach((status) => {
          // Check if it has an interval (is a DOT/HOT)
          if (status.interval > 0) {
              // Check if ready to tick
              if (now - status.lastTick >= status.interval) {
                  // Apply Effect
                  // TODO: Use a map of handlers for different types?
                  // For now, hardcode 'burn', 'poison', 'regen' logic or generic 'damage'/'heal'

                  if (status.type === 'burn' || status.type === 'poison') {
                      this.applyDamage(entity, status.value);
                      console.log(`🔥 DOT: ${entity.id} took ${status.value} damage from ${status.type}`);
                  } else if (status.type === 'regen') {
                      this.healEntity(entity, status.value);
                  }

                  status.lastTick = now;
              }
          }
      });
  }
}
