import { ChaseBehavior } from '../ai/behaviors/ChaseBehavior'
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { AIContext } from '../ai/core/AIContext'

describe('AI Behavior - Chase', () => {
  test('engages when player within detection range and moves toward player', () => {
    const behavior = new ChaseBehavior()

    const mob = new Mob({ id: 'mob-1', x: 0, y: 0, vx: 0, vy: 0 })
    const playerNear = new Player('p1', 'P1', 20, 0) // distance 20 within detection and >=10

    const context: AIContext = {
      gameState: {} as any,
      physicsManager: undefined,
      selfMob: mob,
      nearbyPlayers: [playerNear],
      nearbyMobs: [],
      threats: [],
      worldBounds: { width: 100, height: 100 },
      currentState: 0 as any,
      memory: { behaviorHistory: [], remember: () => {}, recall: () => undefined } as any,
    }

    expect(behavior.canExecute(context)).toBe(true)
    const decision = behavior.execute(mob, context)
    // Should head toward +x direction
    expect(decision.velocity.x).toBeGreaterThan(0)
    expect(Math.abs(decision.velocity.y)).toBeLessThan(1e-6)
  })

  test('does not engage when no players nearby', () => {
    const behavior = new ChaseBehavior()

    const mob = new Mob({ id: 'mob-2', x: 0, y: 0, vx: 0, vy: 0 })
    const context: AIContext = {
      gameState: {} as any,
      physicsManager: undefined,
      selfMob: mob,
      nearbyPlayers: [],
      nearbyMobs: [],
      threats: [],
      worldBounds: { width: 100, height: 100 },
      currentState: 0 as any,
      memory: { behaviorHistory: [], remember: () => {}, recall: () => undefined } as any,
    }

    expect(behavior.canExecute(context)).toBe(false)
  })
})
