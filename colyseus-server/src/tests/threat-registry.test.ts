import { ThreatRegistry } from '../ai/threat/ThreatRegistry'

describe('ThreatRegistry', () => {
  it('gives each agent an isolated table', () => {
    const r = new ThreatRegistry()
    r.forAgent({ agentId: 'mobA' }).add({ entityId: 'p1', amount: 10, now: 0 })
    expect(r.forAgent({ agentId: 'mobA' }).valueOf({ entityId: 'p1', now: 0 })).toBeCloseTo(10)
    expect(r.forAgent({ agentId: 'mobB' }).valueOf({ entityId: 'p1', now: 0 })).toBe(0)
  })

  it('peek does not create a table', () => {
    const r = new ThreatRegistry()
    expect(r.peek({ agentId: 'ghost' })).toBeNull()
  })

  it('forgetEntity drops the entity from every table', () => {
    const r = new ThreatRegistry()
    r.forAgent({ agentId: 'mobA' }).add({ entityId: 'p1', amount: 10, now: 0 })
    r.forAgent({ agentId: 'mobB' }).add({ entityId: 'p1', amount: 20, now: 0 })

    r.forgetEntity({ entityId: 'p1' })

    expect(r.forAgent({ agentId: 'mobA' }).valueOf({ entityId: 'p1', now: 0 })).toBe(0)
    expect(r.forAgent({ agentId: 'mobB' }).valueOf({ entityId: 'p1', now: 0 })).toBe(0)
  })

  it('removeAgent discards that agent table', () => {
    const r = new ThreatRegistry()
    r.forAgent({ agentId: 'mobA' }).add({ entityId: 'p1', amount: 10, now: 0 })
    r.removeAgent({ agentId: 'mobA' })
    expect(r.peek({ agentId: 'mobA' })).toBeNull()
  })
})
