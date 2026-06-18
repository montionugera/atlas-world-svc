import { SteeringBehaviors } from '../physics/SteeringBehaviors'

/**
 * SteeringBehaviors is pure math used by MobController for movement impulses.
 * It had 0% coverage; these tests lock in direction normalization, the
 * desired-minus-current steering force, mass/gain scaling and the safety clamp.
 */
describe('SteeringBehaviors', () => {
  describe('calculateDirectionToTarget', () => {
    it('returns a unit vector pointing toward the target', () => {
      const dir = SteeringBehaviors.calculateDirectionToTarget({ x: 0, y: 0 }, { x: 3, y: 4 })
      expect(dir.x).toBeCloseTo(0.6, 5)
      expect(dir.y).toBeCloseTo(0.8, 5)
      expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 5)
    })

    it('does not divide by zero when origin equals target', () => {
      const dir = SteeringBehaviors.calculateDirectionToTarget({ x: 5, y: 5 }, { x: 5, y: 5 })
      expect(Number.isFinite(dir.x)).toBe(true)
      expect(Number.isFinite(dir.y)).toBe(true)
      expect(dir.x).toBe(0)
      expect(dir.y).toBe(0)
    })
  })

  describe('calculateDirectionAwayFromTarget', () => {
    it('returns the opposite of the toward direction', () => {
      const origin = { x: 0, y: 0 }
      const target = { x: 3, y: 4 }
      const away = SteeringBehaviors.calculateDirectionAwayFromTarget(origin, target)
      const toward = SteeringBehaviors.calculateDirectionToTarget(origin, target)
      expect(away.x).toBeCloseTo(-toward.x, 5)
      expect(away.y).toBeCloseTo(-toward.y, 5)
    })
  })

  describe('computeSteeringImpulse', () => {
    it('is zero when already at the desired velocity', () => {
      const impulse = SteeringBehaviors.computeSteeringImpulse({
        currentVelocity: { x: 2, y: 2 },
        desiredVelocity: { x: 2, y: 2 },
        mass: 10,
      })
      expect(impulse.x).toBe(0)
      expect(impulse.y).toBe(0)
    })

    it('scales the (desired - current) steering force by mass and gain', () => {
      const impulse = SteeringBehaviors.computeSteeringImpulse({
        currentVelocity: { x: 0, y: 0 },
        desiredVelocity: { x: 1, y: 0 },
        mass: 4,
        gain: 0.5,
        maxImpulsePerTick: 1000, // high so it does not clamp
      })
      // steer = (1,0); impulse = steer * mass * gain = 1 * 4 * 0.5 = 2
      expect(impulse.x).toBeCloseTo(2, 5)
      expect(impulse.y).toBeCloseTo(0, 5)
    })

    it('clamps the impulse magnitude to maxImpulsePerTick', () => {
      const impulse = SteeringBehaviors.computeSteeringImpulse({
        currentVelocity: { x: 0, y: 0 },
        desiredVelocity: { x: 100, y: 0 },
        mass: 10,
        gain: 1,
        maxImpulsePerTick: 5,
      })
      expect(Math.hypot(impulse.x, impulse.y)).toBeCloseTo(5, 5)
    })

    it('preserves direction when clamping', () => {
      const impulse = SteeringBehaviors.computeSteeringImpulse({
        currentVelocity: { x: 0, y: 0 },
        desiredVelocity: { x: 3, y: 4 }, // direction 0.6, 0.8
        mass: 10,
        gain: 1,
        maxImpulsePerTick: 10,
      })
      const mag = Math.hypot(impulse.x, impulse.y)
      expect(mag).toBeCloseTo(10, 5)
      expect(impulse.x / mag).toBeCloseTo(0.6, 5)
      expect(impulse.y / mag).toBeCloseTo(0.8, 5)
    })
  })
})
