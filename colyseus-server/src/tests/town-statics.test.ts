import * as planck from 'planck'
import { PlanckPhysicsManager, CreateStaticBoxOptions } from '../physics/PlanckPhysicsManager'
import { buildTownStatics, TownPlan } from '../physics/buildTownStatics'

/**
 * F-040 task 8 — the collision binder.
 *
 * Design §5: footprints become static bodies; roads, plazas, water and landmarks
 * produce NO bodies. The zero-body assertions below are the whole point of the file:
 * "water is not collision" is a decision, and an undecided one for roads/plazas would
 * silently become a ground plane nobody authored.
 */

/** Records calls instead of building physics — proves the binder's arithmetic in isolation. */
class FakeStaticBoxTarget {
  public readonly calls: CreateStaticBoxOptions[] = []

  createStaticBox(options: CreateStaticBoxOptions): CreateStaticBoxOptions {
    this.calls.push(options)
    return options
  }
}

/**
 * Local-space plan. Every non-footprint array is populated deliberately: if the binder
 * ever started binding them, the counts below would move.
 */
const PLAN: TownPlan = {
  town: 'testville',
  extent: { width: 220, height: 160 },
  footprints: [
    // 20 x 16, local centre (106, 52)
    { id: 'mill-house', kind: 'mill', rect: [96, 44, 116, 60], storeys: 2, entranceOn: 'ford' },
    // 10 x 8, local centre (25, 24)
    { id: 'dwelling-a', kind: 'dwelling', rect: [20, 20, 30, 28] },
    // 12 x 12, local centre (206, 126) — reversed corner order, same rect
    { id: 'stable-a', kind: 'stable', rect: [212, 132, 200, 120] },
  ],
  roads: [
    {
      id: 'ford-approach',
      kind: 'cart',
      width: 14,
      points: [
        [110, 160],
        [108, 96],
        [104, 60],
      ],
    },
    {
      id: 'mill-lane',
      kind: 'foot',
      width: 5,
      points: [
        [20, 30],
        [96, 50],
      ],
    },
  ],
  plazas: [{ id: 'cart-yard', rect: [88, 100, 132, 126], why: 'where the queue waits' }],
  water: [
    {
      id: 'the-meltwash',
      kind: 'river',
      poly: [
        [0, 52],
        [220, 58],
        [220, 74],
        [0, 68],
      ],
    },
  ],
  landmarks: [{ id: 'mill-wheel', at: [118, 52], firstSight: true }],
}

const ORIGIN = { x: 1000, y: -250 }

/** Expected WORLD centres and half-extents, i.e. local centre + ORIGIN. */
const EXPECTED = [
  { id: 'mill-house', center: { x: 1106, y: -198 }, halfWidth: 10, halfHeight: 8 },
  { id: 'dwelling-a', center: { x: 1025, y: -226 }, halfWidth: 5, halfHeight: 4 },
  { id: 'stable-a', center: { x: 1206, y: -124 }, halfWidth: 6, halfHeight: 6 },
]

/** A plan with everything EXCEPT footprints — nothing here is collision. */
const NO_FOOTPRINT_PLAN: TownPlan = { ...PLAN, footprints: [] }

describe('buildTownStatics — against a fake target', () => {
  test('creates exactly one box per footprint', () => {
    const target = new FakeStaticBoxTarget()

    const bodies = buildTownStatics({ plan: PLAN, physicsManager: target, origin: ORIGIN })

    expect(target.calls).toHaveLength(PLAN.footprints.length)
    expect(bodies).toHaveLength(PLAN.footprints.length)
    expect(target.calls.map(call => call.id)).toEqual(['mill-house', 'dwelling-a', 'stable-a'])
  })

  test('each box is at local centre + origin, with the footprint half-extents', () => {
    const target = new FakeStaticBoxTarget()

    buildTownStatics({ plan: PLAN, physicsManager: target, origin: ORIGIN })

    EXPECTED.forEach((expected, index) => {
      const call = target.calls[index]
      expect(call.id).toBe(expected.id)
      expect(call.center.x).toBeCloseTo(expected.center.x, 6)
      expect(call.center.y).toBeCloseTo(expected.center.y, 6)
      expect(call.halfWidth).toBeCloseTo(expected.halfWidth, 6)
      expect(call.halfHeight).toBeCloseTo(expected.halfHeight, 6)
    })
  })

  test('a zero origin leaves the plan in its own local space', () => {
    const target = new FakeStaticBoxTarget()

    buildTownStatics({ plan: PLAN, physicsManager: target, origin: { x: 0, y: 0 } })

    expect(target.calls[0].center).toEqual({ x: 106, y: 52 })
  })

  test('roads, plazas, water and landmarks produce ZERO bodies', () => {
    const target = new FakeStaticBoxTarget()

    const bodies = buildTownStatics({
      plan: NO_FOOTPRINT_PLAN,
      physicsManager: target,
      origin: ORIGIN,
    })

    expect(NO_FOOTPRINT_PLAN.roads).not.toHaveLength(0)
    expect(NO_FOOTPRINT_PLAN.plazas).not.toHaveLength(0)
    expect(NO_FOOTPRINT_PLAN.water).not.toHaveLength(0)
    expect(NO_FOOTPRINT_PLAN.landmarks).not.toHaveLength(0)
    expect(target.calls).toHaveLength(0)
    expect(bodies).toHaveLength(0)
  })
})

describe('buildTownStatics — against a real PlanckPhysicsManager', () => {
  let physics: PlanckPhysicsManager

  beforeEach(() => {
    physics = new PlanckPhysicsManager()
  })

  afterEach(() => {
    physics.destroy()
  })

  test('creates one static body per footprint at the right world position', () => {
    const bodies = buildTownStatics({ plan: PLAN, physicsManager: physics, origin: ORIGIN })

    expect(bodies).toHaveLength(PLAN.footprints.length)

    bodies.forEach((body, index) => {
      const expected = EXPECTED[index]
      expect(body.isStatic()).toBe(true)
      expect(body.getPosition().x).toBeCloseTo(expected.center.x, 5)
      expect(body.getPosition().y).toBeCloseTo(expected.center.y, 5)
      expect(physics.getEntityDataFromBody(body)).toEqual({
        type: 'townStatic',
        id: expected.id,
      })
    })
  })

  test('each body carries a solid box fixture spanning the footprint', () => {
    const bodies = buildTownStatics({ plan: PLAN, physicsManager: physics, origin: ORIGIN })
    // Probe distance either side of the edge. Smaller than any half-extent above, so
    // "just inside" and "just outside" really do straddle the intended boundary.
    const EPSILON = 0.1

    // Without this the forEach below passes vacuously on an empty result.
    expect(bodies).toHaveLength(EXPECTED.length)

    bodies.forEach((body, index) => {
      const expected = EXPECTED[index]
      const fixture = body.getFixtureList()
      expect(fixture).toBeTruthy()
      expect(fixture!.isSensor()).toBe(false)
      expect(fixture!.getShape().getType()).toBe('polygon')

      const at = (dx: number, dy: number) =>
        fixture!.testPoint(planck.Vec2(expected.center.x + dx, expected.center.y + dy))

      expect(at(0, 0)).toBe(true)
      expect(at(expected.halfWidth - EPSILON, 0)).toBe(true)
      expect(at(0, expected.halfHeight - EPSILON)).toBe(true)
      expect(at(expected.halfWidth + EPSILON, 0)).toBe(false)
      expect(at(0, expected.halfHeight + EPSILON)).toBe(false)
    })
  })

  test('roads, plazas, water and landmarks produce ZERO bodies', () => {
    const bodies = buildTownStatics({
      plan: NO_FOOTPRINT_PLAN,
      physicsManager: physics,
      origin: ORIGIN,
    })

    expect(bodies).toHaveLength(0)
  })
})
