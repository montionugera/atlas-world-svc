import { Mob } from '../schemas/Mob'
import { SteeringBehaviors } from '../physics/SteeringBehaviors'
import { MobCombatSystem } from './MobCombatSystem'
import { GameState } from '../schemas/GameState'

// ...

export class MobController {
  private mob: Mob
  private combatSystem: MobCombatSystem

  constructor(mob: Mob, combatSystem: MobCombatSystem) {
    this.mob = mob
    this.combatSystem = combatSystem
  }

  /**
   * Main update loop for Mob logic
   * Orchestrates movement, heading, and delegating combat
   */
  update(
    deltaTime: number,
    gameState?: GameState
  ): { attacked: boolean; targetId?: string; messageCreated?: boolean; message?: any } {

    // Status Effect Check: If stunned, stop all movement and actions
    if (this.mob.isStunned) {
        this.mob.vx = 0
        this.mob.vy = 0
        this.mob.isMoving = false
        this.mob.isCasting = false // Interrupt casting

        // Clear attack queue and reset attack state
        if (this.mob.attackQueue.length > 0) {
            this.mob.attackQueue.length = 0
            this.mob.currentAttackStrategy = null
            this.mob.castStartTime = 0
        }

        return { attacked: false }
    }

    if (gameState) {
      this.updateMobPosition(gameState)
      this.updateHeadingToTarget(deltaTime)
      return this.combatSystem.update(deltaTime, gameState, gameState.roomId)
    }

    return { attacked: false }
  }

  // Compute steering impulse to move current physics velocity toward desired velocity
  computeSteeringImpulse(params: {
    currentVelocity: { x: number; y: number }
    desiredVelocity: { x: number; y: number }
    mass: number
    gain?: number
    maxImpulsePerTick?: number
  }): { x: number; y: number } {
    return SteeringBehaviors.computeSteeringImpulse(params)
  }

  // Update heading directly from target position
  updateHeadingToTarget(deltaTime: number): void {
    const dx = this.mob.targetX - this.mob.x
    const dy = this.mob.targetY - this.mob.y
    const magnitude = Math.hypot(dx, dy)

    // Valid target vector check
    if (magnitude <= 0.01) return

    const targetHeading = Math.atan2(dy, dx)

    // Rotation speed is handled by the Mob (see Mob.updateHeadingToTarget).
    // MobController here only provides geometric turning toward the target point.
    const currentRotationSpeed = this.mob.rotationSpeed

    // Smooth rotation (interpolate towards target heading)
    let diff = targetHeading - this.mob.heading

    // Normalize difference to [-PI, PI] to rotate shortest way
    while (diff < -Math.PI) diff += Math.PI * 2
    while (diff > Math.PI) diff -= Math.PI * 2

    // Max rotation for this frame
    const maxRotate = currentRotationSpeed * (deltaTime / 1000)

    if (Math.abs(diff) <= maxRotate) {
        // Close enough, snap to target
        this.mob.heading = targetHeading
    } else {
        // Rotate towards target
        this.mob.heading += Math.sign(diff) * maxRotate

        // Normalize heading
        if (this.mob.heading > Math.PI) this.mob.heading -= Math.PI * 2
        else if (this.mob.heading < -Math.PI) this.mob.heading += Math.PI * 2
    }
  }

  applyBoundaryPhysics(width: number, height: number) {
    // Bounce off walls
    if (this.mob.x <= 0 || this.mob.x >= width) {
      this.mob.vx = -this.mob.vx
      this.mob.x = Math.max(0, Math.min(width, this.mob.x))
    }
    if (this.mob.y <= 0 || this.mob.y >= height) {
      this.mob.vy = -this.mob.vy
      this.mob.y = Math.max(0, Math.min(height, this.mob.y))
    }
  }

  updateMobPosition(gameState: { players: Map<string, any>; npcs: Map<string, any> }): {
    moved: boolean
    targetX?: number
    targetY?: number
  } {
    const getTarget = (id: string) => gameState.players.get(id) ?? gameState.npcs.get(id)
    if (this.mob.currentBehavior === 'attack' && this.mob.currentAttackTarget) {
      const attackTarget = getTarget(this.mob.currentAttackTarget)
      if (attackTarget && attackTarget.isAlive) {
        this.mob.targetX = attackTarget.x
        this.mob.targetY = attackTarget.y
        return { moved: true, targetX: this.mob.targetX, targetY: this.mob.targetY }
      }
    } else if (this.mob.currentBehavior === 'chase' && this.mob.currentChaseTarget) {
      const chaseTarget = getTarget(this.mob.currentChaseTarget)
      if (chaseTarget && chaseTarget.isAlive) {
        this.mob.targetX = chaseTarget.x
        this.mob.targetY = chaseTarget.y
        return { moved: true, targetX: this.mob.targetX, targetY: this.mob.targetY }
      }
    } else if (this.mob.currentBehavior === 'wander') {
      // Wander behavior: use wander target
      this.mob.targetX = this.mob.wanderTargetX
      this.mob.targetY = this.mob.wanderTargetY
      return { moved: true, targetX: this.mob.targetX, targetY: this.mob.targetY }
    }

    return { moved: false }
  }
}
