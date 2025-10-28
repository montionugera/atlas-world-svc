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

  // Find target in attack direction (heading-based)
  findTargetInDirection(mobs: Map<string, any>): any | null {
    if (!this.canAttack()) return null

    const attackCone = Math.PI / 4 // 45-degree attack cone
    const maxRange = this.attackRange + this.radius
    let nearestTarget: any = null
    let nearestDistance = Infinity

    for (const mob of mobs.values()) {
      if (!mob.isAlive) continue

      const distance = this.getDistanceTo(mob)
      if (distance > maxRange + mob.radius) continue

      // Calculate angle between player heading and direction to mob
      const dx = mob.x - this.x
      const dy = mob.y - this.y
      const angleToMob = Math.atan2(dy, dx)
      const angleDiff = Math.abs(this.heading - angleToMob)

      // Check if mob is within attack cone (handle angle wrapping)
      const normalizedAngleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff)
      if (normalizedAngleDiff <= attackCone) {
        if (distance < nearestDistance) {
          nearestTarget = mob
          nearestDistance = distance
        }
      }
    }

    return nearestTarget
  }

  // Process attack input and find target
  processAttackInput(mobs: Map<string, any>, roomId: string): boolean {
    if (!this.input.attack || !this.canAttack()) return false

    const target = this.findTargetInDirection(mobs)
    if (target) {
      // Emit attack event - let BattleManager handle the rest
      const { eventBus, RoomEventType } = require('../events/EventBus')
      const attackData = {
        actorId: this.id,
        targetId: target.id,
        damage: this.attackDamage,
        range: this.attackRange,
        roomId: roomId
      }

      eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData)
      console.log(`⚔️ PLAYER ${this.id} attacking ${target.id} in heading direction`)
      return true
    }

    return false
  }
}
