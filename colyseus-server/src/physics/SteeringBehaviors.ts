/**
 * SteeringBehaviors - Pure functional helper for steering physics
 * 
 * Provides static methods to calculate steering forces and impulses.
 * Decouples math from the Mob schema.
 */

export class SteeringBehaviors {
  /**
   * Calculate normalized direction vector from origin to target
   */
  static calculateDirectionToTarget(origin: { x: number; y: number }, target: { x: number; y: number }): { x: number; y: number } {
    const dx = target.x - origin.x
    const dy = target.y - origin.y
    const distance = Math.hypot(dx, dy) || 1
    return { x: dx / distance, y: dy / distance }
  }

  /**
   * Calculate normalized direction vector away from target (flee)
   */
  static calculateDirectionAwayFromTarget(origin: { x: number; y: number }, target: { x: number; y: number }): { x: number; y: number } {
    const dx = origin.x - target.x
    const dy = origin.y - target.y
    const distance = Math.hypot(dx, dy) || 1
    return { x: dx / distance, y: dy / distance }
  }

  /**
   * Compute steering impulse to move current velocity toward desired velocity
   * Returns an impulse vector scaled by mass and clamped
   */
  static computeSteeringImpulse(params: {
    currentVelocity: { x: number; y: number }
    desiredVelocity: { x: number; y: number }
    mass: number
    gain?: number // tuning factor for responsiveness (default 0.2)
    maxImpulsePerTick?: number // safety clamp (default mass * 1.0)
  }): { x: number; y: number } {
    const { currentVelocity, desiredVelocity, mass } = params
    const gain = params.gain ?? 0.2
    const maxImpulse = params.maxImpulsePerTick ?? mass * 1.0
    
    // Steering force = Desired - Current
    const steerX = desiredVelocity.x - currentVelocity.x
    const steerY = desiredVelocity.y - currentVelocity.y
    
    // Scale by mass and gain
    let impulseX = steerX * mass * gain
    let impulseY = steerY * mass * gain
    
    // Clamp magnitude
    const mag = Math.hypot(impulseX, impulseY)
    if (mag > maxImpulse) {
      const s = maxImpulse / (mag || 1)
      impulseX *= s
      impulseY *= s
    }
    
    return { x: impulseX, y: impulseY }
  }
}
