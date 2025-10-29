import { Mob } from '../schemas/Mob'

describe('Mob-centric AI decisions', () => {
  test('decideBehavior selects attack within 20 and locks briefly', () => {
    const mob = new Mob({ id: 'm1', x: 0, y: 0, vx: 0, vy: 0 })
    const now = performance.now()

    const envClose = {
      nearestPlayer: { x: 5, y: 0, id: 'player1' },
      distanceToNearestPlayer: 5,
      nearBoundary: false,
    }

    const chosen = mob.decideBehavior(envClose)
    expect(chosen).toBe('attack')
    expect(mob.currentBehavior).toBe('attack')
    // Current implementation uses 500ms lock
    expect(mob.behaviorLockedUntil).toBeGreaterThanOrEqual(now + 400)
  })

  test('locked behavior remains attack even if player moves away briefly', () => {
    const mob = new Mob({ id: 'm2', x: 0, y: 0, vx: 0, vy: 0 })
    // Enter attack state
    mob.decideBehavior({
      nearestPlayer: { x: 0, y: 0, id: 'player1' },
      distanceToNearestPlayer: 0,
      nearBoundary: false,
    })
    const lockedUntil = mob.behaviorLockedUntil
    expect(mob.currentBehavior).toBe('attack')
    expect(lockedUntil).toBeGreaterThan(0)

    // Now far away but still within lock window
    const envFar = {
      nearestPlayer: { x: 100, y: 0, id: 'player1' },
      distanceToNearestPlayer: 100,
      nearBoundary: false,
    }
    const chosen = mob.decideBehavior(envFar)
    expect(chosen).toBe('attack')
    expect(mob.behaviorLockedUntil).toBe(lockedUntil)
  })

  test('computeDesiredVelocity heads toward player when chase, stops when attack', () => {
    const mob = new Mob({ id: 'm3', x: 0, y: 0, vx: 0, vy: 0 })

    // Test chase behavior - should move toward player
    mob.currentBehavior = 'chase'
    const chaseDesired = mob.computeDesiredVelocity({
      nearestPlayer: { x: 10, y: 0, id: 'player1', radius: 4 },
      distanceToNearestPlayer: 10,
    })
    expect(chaseDesired.x).toBeGreaterThan(0)
    expect(Math.abs(chaseDesired.y)).toBeLessThan(1e-6)
    // For chase, speed is limited by maxStoppingSpeed when close to target
    expect(Math.hypot(chaseDesired.x, chaseDesired.y)).toBeCloseTo(3, 1)

    // Test attack behavior - should stop moving
    mob.currentBehavior = 'attack'
    const attackDesired = mob.computeDesiredVelocity({
      nearestPlayer: { x: 10, y: 0, id: 'player1', radius: 4 },
      distanceToNearestPlayer: 10,
    })
    expect(attackDesired.x).toBe(0)
    expect(attackDesired.y).toBe(0)
  })

  test('decideBehavior picks avoidBoundary when near edge', () => {
    const mob = new Mob({ id: 'm4', x: 5, y: 5, vx: 0, vy: 0 })
    const env = {
      nearestPlayer: null as any,
      distanceToNearestPlayer: Infinity,
      nearBoundary: true,
    }
    const chosen = mob.decideBehavior(env)
    expect(chosen).toBe('avoidBoundary')
    expect(mob.tag).toBe('avoidBoundary')
  })

  test('decideBehavior defaults to wander when nothing else applies', () => {
    const mob = new Mob({ id: 'm5', x: 50, y: 50, vx: 1, vy: 0 })
    const env = {
      nearestPlayer: null as any,
      distanceToNearestPlayer: Infinity,
      nearBoundary: false,
    }
    const chosen = mob.decideBehavior(env)
    expect(chosen).toBe('wander')
    expect(mob.tag).toBe('wander')
  })
})
