import { ThreatTable } from './ThreatTable'

/**
 * Owns one ThreatTable per agent.
 *
 * `forgetEntity` is the leak guard: when a player disconnects or an entity dies,
 * its threat must vanish from every mob that remembered it, not just the one it
 * was fighting.
 */
export class ThreatRegistry {
  private readonly tables = new Map<string, ThreatTable>()

  forAgent(options: { agentId: string }): ThreatTable {
    let table = this.tables.get(options.agentId)
    if (!table) {
      table = new ThreatTable()
      this.tables.set(options.agentId, table)
    }
    return table
  }

  peek(options: { agentId: string }): ThreatTable | null {
    return this.tables.get(options.agentId) ?? null
  }

  forgetEntity(options: { entityId: string }): void {
    for (const table of this.tables.values()) {
      table.remove({ entityId: options.entityId })
    }
    this.tables.delete(options.entityId)
  }

  removeAgent(options: { agentId: string }): void {
    this.tables.delete(options.agentId)
  }
}
