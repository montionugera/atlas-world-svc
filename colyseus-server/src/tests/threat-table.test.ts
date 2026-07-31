import { ThreatTable } from '../ai/threat/ThreatTable'
import { THREAT_CONFIG } from '../config/combat/threat'

describe('ThreatTable', () => {
  it('accumulates threat per entity', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'p1', amount: 10, now: 0 })
    t.add({ entityId: 'p1', amount: 5, now: 0 })
    t.add({ entityId: 'p2', amount: 3, now: 0 })
    expect(t.valueOf({ entityId: 'p1', now: 0 })).toBeCloseTo(15)
    expect(t.valueOf({ entityId: 'p2', now: 0 })).toBeCloseTo(3)
  })

  it('decays by half over one half-life', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'p1', amount: 100, now: 0 })
    expect(t.valueOf({ entityId: 'p1', now: THREAT_CONFIG.halfLifeMs })).toBeCloseTo(50, 5)
  })

  it('returns the highest-threat candidate, ignoring absent ones', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'p1', amount: 10, now: 0 })
    t.add({ entityId: 'p2', amount: 40, now: 0 })
    expect(t.best({ candidateIds: ['p1', 'p2'], now: 0 })?.entityId).toBe('p2')
    // p2 out of range: p1 wins even though its threat is lower
    expect(t.best({ candidateIds: ['p1'], now: 0 })?.entityId).toBe('p1')
    expect(t.best({ candidateIds: ['p9'], now: 0 })).toBeNull()
  })

  it('evicts the lowest entry at the cap instead of growing', () => {
    const t = new ThreatTable()
    for (let i = 0; i < THREAT_CONFIG.maxEntries; i++) {
      t.add({ entityId: `p${i}`, amount: 100 + i, now: 0 })
    }
    expect(t.size()).toBe(THREAT_CONFIG.maxEntries)
    t.add({ entityId: 'newcomer', amount: 999, now: 0 })
    expect(t.size()).toBe(THREAT_CONFIG.maxEntries)
    // p0 had the lowest threat and was evicted; the newcomer is present
    expect(t.valueOf({ entityId: 'p0', now: 0 })).toBe(0)
    expect(t.valueOf({ entityId: 'newcomer', now: 0 })).toBeCloseTo(999)
  })

  it('taunt outranks the current leader and reports a lock', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'dps', amount: 1000, now: 0 })
    t.taunt({ entityId: 'tank', now: 0 })
    expect(t.best({ candidateIds: ['dps', 'tank'], now: 0 })?.entityId).toBe('tank')
    expect(t.isTauntLocked({ now: 0 })).toBe(true)
    expect(t.tauntedTarget({ now: 0 })).toBe('tank')
  })

  it('releases the taunt lock after tauntLockMs', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'dps', amount: 1000, now: 0 })
    t.taunt({ entityId: 'tank', now: 0 })
    const after = THREAT_CONFIG.tauntLockMs + 1
    expect(t.isTauntLocked({ now: after })).toBe(false)
    expect(t.tauntedTarget({ now: after })).toBeNull()
  })

  it('drops an entity on remove', () => {
    const t = new ThreatTable()
    t.add({ entityId: 'p1', amount: 10, now: 0 })
    t.remove({ entityId: 'p1' })
    expect(t.valueOf({ entityId: 'p1', now: 0 })).toBe(0)
    expect(t.size()).toBe(0)
  })
})
