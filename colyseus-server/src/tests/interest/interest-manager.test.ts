import { StateView } from '@colyseus/schema'
import { InterestManager } from '../../interest/InterestManager'
import { createDistancePredicate, VisibilityPredicate } from '../../interest/visibility'

// A stand-in for a schema-backed entity. InterestManager only needs an id,
// a position, and an opaque `ref` to hand to StateView.add/remove.
const entity = (id: string, x: number, y: number) => ({ id, x, y, ref: { id } })
const viewer = (sessionId: string, x: number, y: number) => ({ sessionId, x, y })

/** Records add/remove calls without needing a real Encoder. */
class FakeView {
  added: object[] = []
  removed: object[] = []
  add(obj: object) {
    this.added.push(obj)
    return true
  }
  remove(obj: object) {
    this.removed.push(obj)
    return this
  }
}

const asView = (v: FakeView) => v as unknown as StateView

describe('InterestManager', () => {
  it('adds an entity that enters the radius exactly once', () => {
    const view = new FakeView()
    const im = new InterestManager({
      predicate: createDistancePredicate({ radius: 100, hysteresis: 1.15 }),
      cellSize: 100,
      candidateRadius: 115,
    })
    im.attach('s1', asView(view), 'p1')

    const near = entity('m1', 150, 100)
    const viewers = [viewer('s1', 100, 100)]
    const self = entity('p1', 100, 100)

    im.update([self, near], viewers)
    im.update([self, near], viewers)

    expect(view.added.filter(o => (o as { id: string }).id === 'm1')).toHaveLength(1)
    expect(view.removed).toHaveLength(0)
  })

  it('does not remove until the entity passes radius * hysteresis', () => {
    const view = new FakeView()
    const im = new InterestManager({
      predicate: createDistancePredicate({ radius: 100, hysteresis: 1.15 }),
      cellSize: 100,
      candidateRadius: 115,
    })
    im.attach('s1', asView(view), 'p1')

    const self = entity('p1', 100, 100)
    const viewers = [viewer('s1', 100, 100)]

    im.update([self, entity('m1', 150, 100)], viewers) // d=50, inside -> add
    expect(im.visibleIdsFor('s1').has('m1')).toBe(true)

    im.update([self, entity('m1', 210, 100)], viewers) // d=110, inside 115 -> keep
    expect(im.visibleIdsFor('s1').has('m1')).toBe(true)
    expect(view.removed).toHaveLength(0)

    im.update([self, entity('m1', 220, 100)], viewers) // d=120, beyond 115 -> drop
    expect(im.visibleIdsFor('s1').has('m1')).toBe(false)
    expect(view.removed).toHaveLength(1)
  })

  it("always includes the viewer's own entity regardless of the predicate", () => {
    const view = new FakeView()
    const never: VisibilityPredicate = () => false
    const im = new InterestManager({ predicate: never, cellSize: 100, candidateRadius: 115 })
    im.attach('s1', asView(view), 'p1')

    im.update([entity('p1', 100, 100), entity('m1', 101, 100)], [viewer('s1', 100, 100)])

    expect(im.visibleIdsFor('s1')).toEqual(new Set(['p1']))
  })

  it('removes an entity that disappears from the world entirely', () => {
    const view = new FakeView()
    const im = new InterestManager({
      predicate: createDistancePredicate({ radius: 100, hysteresis: 1.15 }),
      cellSize: 100,
      candidateRadius: 115,
    })
    im.attach('s1', asView(view), 'p1')

    const self = entity('p1', 100, 100)
    const viewers = [viewer('s1', 100, 100)]

    im.update([self, entity('m1', 110, 100)], viewers)
    expect(im.visibleIdsFor('s1').has('m1')).toBe(true)

    im.update([self], viewers) // m1 despawned
    expect(im.visibleIdsFor('s1').has('m1')).toBe(false)
    expect(view.removed).toHaveLength(1)
  })

  it('honours a custom predicate composed with distance (the I-053 seam)', () => {
    const view = new FakeView()
    const distance = createDistancePredicate({ radius: 100, hysteresis: 1.15 })
    const phaseHidden = new Set(['m2'])
    const composed: VisibilityPredicate = (c, ctx) => distance(c, ctx) && !phaseHidden.has(c.id)

    const im = new InterestManager({ predicate: composed, cellSize: 100, candidateRadius: 115 })
    im.attach('s1', asView(view), 'p1')

    im.update(
      [entity('p1', 100, 100), entity('m1', 110, 100), entity('m2', 110, 100)],
      [viewer('s1', 100, 100)]
    )

    expect(im.visibleIdsFor('s1')).toEqual(new Set(['p1', 'm1']))
  })

  it('detach() drops all bookkeeping for that session', () => {
    const view = new FakeView()
    const im = new InterestManager({
      predicate: createDistancePredicate({ radius: 100, hysteresis: 1.15 }),
      cellSize: 100,
      candidateRadius: 115,
    })
    im.attach('s1', asView(view), 'p1')
    im.update([entity('p1', 100, 100)], [viewer('s1', 100, 100)])

    im.detach('s1')

    expect(im.visibleIdsFor('s1').size).toBe(0)
    // A viewer with no attached view must not throw.
    expect(() => im.update([entity('p1', 100, 100)], [viewer('s1', 100, 100)])).not.toThrow()
  })

  it('keeps two viewers independent', () => {
    const viewA = new FakeView()
    const viewB = new FakeView()
    const im = new InterestManager({
      predicate: createDistancePredicate({ radius: 100, hysteresis: 1.15 }),
      cellSize: 100,
      candidateRadius: 115,
    })
    im.attach('sA', asView(viewA), 'pA')
    im.attach('sB', asView(viewB), 'pB')

    im.update(
      [entity('pA', 0, 0), entity('pB', 1000, 1000), entity('m1', 50, 0)],
      [viewer('sA', 0, 0), viewer('sB', 1000, 1000)]
    )

    expect(im.visibleIdsFor('sA')).toEqual(new Set(['pA', 'm1']))
    expect(im.visibleIdsFor('sB')).toEqual(new Set(['pB']))
  })
})
