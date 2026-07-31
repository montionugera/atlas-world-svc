import { selectTarget } from '../ai/targeting/selectTarget'
import { ThreatTable } from '../ai/threat/ThreatTable'
import { THREAT_CONFIG } from '../config/combat/threat'

const near = { id: 'near', distance: 2 }
const far = { id: 'far', distance: 40 }

describe('selectTarget', () => {
  it('falls back to nearest when no candidate has threat', () => {
    const picked = selectTarget({
      candidates: [far, near],
      table: new ThreatTable(),
      currentTargetId: '',
      now: 0,
    })
    expect(picked?.id).toBe('near')
  })

  it('falls back to nearest when there is no table at all', () => {
    const picked = selectTarget({
      candidates: [far, near],
      table: null,
      currentTargetId: '',
      now: 0,
    })
    expect(picked?.id).toBe('near')
  })

  it('prefers the highest-threat candidate over the nearest', () => {
    const table = new ThreatTable()
    table.add({ entityId: 'far', amount: 500, now: 0 })
    const picked = selectTarget({
      candidates: [far, near],
      table,
      currentTargetId: '',
      now: 0,
    })
    expect(picked?.id).toBe('far')
  })

  it('holds the current target when a challenger is inside switchMargin', () => {
    const table = new ThreatTable()
    table.add({ entityId: 'near', amount: 100, now: 0 })
    // Just under the margin -- not enough to steal.
    table.add({ entityId: 'far', amount: 100 * THREAT_CONFIG.switchMargin - 1, now: 0 })

    const picked = selectTarget({
      candidates: [far, near],
      table,
      currentTargetId: 'near',
      now: 0,
    })
    expect(picked?.id).toBe('near')
  })

  it('switches when a challenger clears switchMargin', () => {
    const table = new ThreatTable()
    table.add({ entityId: 'near', amount: 100, now: 0 })
    table.add({ entityId: 'far', amount: 100 * THREAT_CONFIG.switchMargin + 1, now: 0 })

    const picked = selectTarget({
      candidates: [far, near],
      table,
      currentTargetId: 'near',
      now: 0,
    })
    expect(picked?.id).toBe('far')
  })

  it('a taunt overrides both threat order and the margin', () => {
    const table = new ThreatTable()
    table.add({ entityId: 'far', amount: 10_000, now: 0 })
    table.taunt({ entityId: 'near', now: 0 })

    const picked = selectTarget({
      candidates: [far, near],
      table,
      currentTargetId: 'far',
      now: 0,
    })
    expect(picked?.id).toBe('near')
  })

  it('ignores a taunt whose target is no longer a candidate', () => {
    const table = new ThreatTable()
    table.add({ entityId: 'far', amount: 10, now: 0 })
    table.taunt({ entityId: 'gone', now: 0 })

    const picked = selectTarget({
      candidates: [far],
      table,
      currentTargetId: '',
      now: 0,
    })
    expect(picked?.id).toBe('far')
  })

  it('returns null with no candidates', () => {
    expect(
      selectTarget({ candidates: [], table: new ThreatTable(), currentTargetId: '', now: 0 })
    ).toBeNull()
  })
})
