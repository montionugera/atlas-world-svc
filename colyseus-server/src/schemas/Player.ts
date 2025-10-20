import { type } from '@colyseus/schema'
import { WorldLife } from './WorldLife'
import { PlayerInput } from './PlayerInput'

export class Player extends WorldLife {
  @type('string') sessionId: string
  @type('string') name: string
  @type('number') maxLinearSpeed: number = 20 // synced to clients

  // Input state (server-only, not synced to clients)
  input: PlayerInput = new PlayerInput()

  // Target position for heading calculation (based on input direction)
  targetX: number = 0
  targetY: number = 0

  // Server-only desired velocity computed from input each tick (not synced)
  desiredVx: number = 0
  desiredVy: number = 0

  constructor(sessionId: string, name: string, x: number = 200, y: number = 150) {
    super({
      id: sessionId,
      x,
      y,
      vx: 0,
      vy: 0,
      tags: ['player'],
      radius: 4, // Player radius
      maxHealth: 100, // Players have more health
      attackDamage: 8, // Players deal less damage
      attackRange: 3, // Players have shorter attack range
      attackDelay: 1000, // Players attack faster
      defense: 1, // Players have low defense
      armor: 0, // Players have no armor
      density: 0.8, // Players are less dense than mobs
    })
    this.sessionId = sessionId
    this.name = name
  }

  // Update heading based on input direction (not physics velocity)
  updateHeadingFromInput(): void {
    const inputMagnitude = this.input.getMovementMagnitude()
    if (inputMagnitude > 0.01) {
      // Use input direction for heading
      const normalized = this.input.getNormalizedMovement()
      this.heading = Math.atan2(normalized.y, normalized.x)
    }
  }
}
