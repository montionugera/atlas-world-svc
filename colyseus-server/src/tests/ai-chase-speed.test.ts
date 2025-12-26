import { Mob } from '../schemas/Mob'
import { ChaseBehavior } from '../ai/behaviors/AgentBehaviors'
import { WanderBehavior } from '../ai/behaviors/AgentBehaviors'

describe('Mob maxMoveSpeed caps desired velocity', () => {
  test('chase speed does not exceed maxMoveSpeed', () => {
    const mob = new Mob({ id: 'm1', x: 0, y: 0, maxMoveSpeed: 10 })
    const chaseBehavior = new ChaseBehavior()
    
    const env = {
      nearestPlayer: { id: 'p1', x: 100, y: 0, radius: 1.3 } as any,
      distanceToNearestPlayer: 100,
      nearBoundary: false,
      worldBounds: { width: 400, height: 300 }
    }
    
    const decision = chaseBehavior.getDecision(mob, env, Date.now())
    const desired = decision.desiredVelocity || { x: 0, y: 0 }
    const speed = Math.hypot(desired.x, desired.y)
    
    expect(speed).toBeLessThanOrEqual(10)
    expect(speed).toBeGreaterThan(0)
  })

  test('wander speed is <= 60% of maxMoveSpeed', () => {
    const mob = new Mob({ id: 'm2', x: 0, y: 0, maxMoveSpeed: 20 })
    const wanderBehavior = new WanderBehavior()
    
    // Set wander target on mob (since behavior reads it from mob)
    mob['wanderTargetX'] = 100
    mob['wanderTargetY'] = 0
    
    const env = {
      nearestPlayer: null,
      distanceToNearestPlayer: Infinity,
      nearBoundary: false,
      worldBounds: { width: 400, height: 300 }
    }
    
    const decision = wanderBehavior.getDecision(mob, env, Date.now())
    const desired = decision.desiredVelocity || { x: 0, y: 0 }
    const speed = Math.hypot(desired.x, desired.y)
    
    expect(speed).toBeCloseTo(12, 5) // 0.6 * 20
  })
})


