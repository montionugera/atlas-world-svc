import { Mob } from '../schemas/Mob'

describe('Mob maxMoveSpeed caps desired velocity', () => {
  test('chase speed does not exceed maxMoveSpeed', () => {
    const mob = new Mob({ id: 'm1', x: 0, y: 0, maxMoveSpeed: 10 })
    mob.currentBehavior = 'chase'
    const desired = mob.computeDesiredVelocity({
      nearestPlayer: { id: 'p1', x: 100, y: 0, radius: 4 },
      worldBounds: { width: 400, height: 300 },
    })
    const speed = Math.hypot(desired.x, desired.y)
    expect(speed).toBeLessThanOrEqual(10)
  })

  test('wander speed is <= 60% of maxMoveSpeed', () => {
    const mob = new Mob({ id: 'm2', x: 0, y: 0, maxMoveSpeed: 20 })
    mob.currentBehavior = 'wander'
    mob['wanderTargetX'] = 100
    mob['wanderTargetY'] = 0
    const desired = mob.computeDesiredVelocity({ worldBounds: { width: 400, height: 300 } })
    const speed = Math.hypot(desired.x, desired.y)
    expect(speed).toBeLessThanOrEqual(12) // 0.6 * 20
  })
})


