/**
 * ProcessedEventTracker - per-entity event dedup cache
 * Owns the Map<EntityId, Map<EventId, Timestamp>> and the dedup/TTL logic
 * extracted verbatim from BattleModule (validateEvent / cleanupProcessedEvents /
 * cleanupAllEvents). Uses Date.now() exactly as before (server-only dedup TTL).
 */
export class ProcessedEventTracker {
  private processedIdsCleanupInterval = 5000 // Cleanup every 5s
  private lastCleanupTime = 0

  // Centralized Event Tracking: Map<EntityId, Map<EventId, Timestamp>>
  private processedEventsByEntityId: Map<string, Map<string, number>> = new Map()

  // Validate if event should be processed
  // Returns TRUE if event is new and should process
  // Returns FALSE if event was already processed
  validate(entityId: string, eventId: string): boolean {
    let entityEvents = this.processedEventsByEntityId.get(entityId)
    if (!entityEvents) {
      entityEvents = new Map<string, number>()
      this.processedEventsByEntityId.set(entityId, entityEvents)
    }

    if (entityEvents.has(eventId)) {
      return false
    }
    entityEvents.set(eventId, Date.now())
    return true
  }

  // Clear all tracked events for an entity (e.g. on respawn)
  clear(entityId: string): void {
    this.processedEventsByEntityId.delete(entityId)
  }

  // Cleanup processed events for one entity (TTL retention)
  private cleanupProcessedEvents(entityId: string): void {
    const entityEvents = this.processedEventsByEntityId.get(entityId)
    if (!entityEvents) return

    const now = Date.now()
    const expiration = 2000 // 2 seconds retention

    const toRemove: string[] = []
    entityEvents.forEach((timestamp, id) => {
      if (now - timestamp > expiration) {
        toRemove.push(id)
      }
    })

    toRemove.forEach(id => entityEvents.delete(id))

    // If empty, remove the entity map entirely to save memory
    if (entityEvents.size === 0) {
      this.processedEventsByEntityId.delete(entityId)
    }
  }

  // Helper to trigger cleanup globally (throttled by processedIdsCleanupInterval)
  cleanupExpired(): void {
    const now = Date.now()
    if (now - this.lastCleanupTime < this.processedIdsCleanupInterval) return
    this.lastCleanupTime = now

    // Iterate all tracked entities
    for (const entityId of this.processedEventsByEntityId.keys()) {
      this.cleanupProcessedEvents(entityId)
    }
  }
}
