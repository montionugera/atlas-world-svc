/**
 * Player Input State
 * Server-only input handling for players
 */

export class PlayerInput {
  // Movement input
  moveX: number = 0
  moveY: number = 0

  // Action input
  jump: boolean = false
  attack: boolean = false
  useItem: boolean = false
  interact: boolean = false

  // Camera input (for future use)
  lookX: number = 0
  lookY: number = 0

  // Input state
  isMoving: boolean = false
  lastInputTime: number = 0

  constructor() {
    this.lastInputTime = performance.now()
  }

  // Update movement input
  setMovement(x: number, y: number) {
    this.moveX = x
    this.moveY = y
    this.isMoving = Math.hypot(x, y) > 0
    this.lastInputTime = performance.now()
  }

  // Update action input
  setAction(action: string, pressed: boolean) {
    switch (action) {
      case 'jump':
        this.jump = pressed
        break
      case 'attack':
        this.attack = pressed
        break
      case 'useItem':
        this.useItem = pressed
        break
      case 'interact':
        this.interact = pressed
        break
    }
    this.lastInputTime = performance.now()
  }

  // Get movement magnitude
  getMovementMagnitude(): number {
    return Math.hypot(this.moveX, this.moveY)
  }

  // Get normalized movement
  getNormalizedMovement(): { x: number; y: number } {
    const magnitude = this.getMovementMagnitude()
    if (magnitude === 0) return { x: 0, y: 0 }
    return {
      x: this.moveX / magnitude,
      y: this.moveY / magnitude,
    }
  }

  // Clear all input
  clear() {
    this.moveX = 0
    this.moveY = 0
    this.jump = false
    this.attack = false
    this.useItem = false
    this.interact = false
    this.lookX = 0
    this.lookY = 0
    this.isMoving = false
  }
}
