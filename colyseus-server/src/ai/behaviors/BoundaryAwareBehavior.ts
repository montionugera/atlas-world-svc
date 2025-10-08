/**
 * Boundary Aware Behavior
 * Mob avoids world boundaries and navigates around them
 */

import { BaseBehavior } from '../core/AIBehavior';
import { AIContext } from '../core/AIContext';
import { Mob } from '../../schemas/Mob';
import { GAME_CONFIG } from '../../config/gameConfig';

export class BoundaryAwareBehavior extends BaseBehavior {
  readonly name = 'boundaryAware';
  readonly priority = 3; // High priority when near boundaries
  
  private boundaryThreshold = 20; // Distance from boundary to trigger behavior
  private avoidanceForce = 2.0; // Strength of avoidance
  
  canExecute(context: AIContext): boolean {
    // Trigger only when the mob is near boundaries; otherwise let wander/others run
    const mob = context.selfMob as Mob;
    if (!mob || !context || !context.worldBounds) return false;
    return this.isNearBoundary(mob, context);
  }
  
  execute(mob: Mob, context: AIContext): any {
    const avoidance = this.calculateBoundaryAvoidance(mob, context);
    
    // Combine with current velocity (if any)
    const currentSpeed = Math.sqrt(mob.vx * mob.vx + mob.vy * mob.vy);
    let velocity = { x: avoidance.x, y: avoidance.y };
    
    // If we have current velocity, blend it with avoidance
    if (currentSpeed > 0.1) {
      const blendFactor = 0.7; // 70% avoidance, 30% current direction
      velocity = {
        x: avoidance.x * blendFactor + mob.vx * (1 - blendFactor),
        y: avoidance.y * blendFactor + mob.vy * (1 - blendFactor)
      };
    }
    
    // Normalize to reasonable speed
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    if (speed > 0) {
      const maxSpeed = GAME_CONFIG.mobSpeedRange * 0.5;
      const scale = Math.min(maxSpeed / speed, 1);
      velocity.x *= scale;
      velocity.y *= scale;
    }
    
    return this.createDecision(velocity);
  }
  
  private isNearBoundary(mob: Mob, context: AIContext): boolean {
    const { width, height } = context.worldBounds;
    return (
      mob.x < this.boundaryThreshold ||
      width - mob.x < this.boundaryThreshold ||
      mob.y < this.boundaryThreshold ||
      height - mob.y < this.boundaryThreshold
    );
  }
  
  private calculateBoundaryAvoidance(mob: Mob, context: AIContext): { x: number; y: number } {
    const avoidance = { x: 0, y: 0 };
    const worldWidth = context.worldBounds.width;
    const worldHeight = context.worldBounds.height;
    
    // Check distance to each boundary
    const distToLeft = mob.x;
    const distToRight = worldWidth - mob.x;
    const distToTop = mob.y;
    const distToBottom = worldHeight - mob.y;
    
    // Avoid left boundary
    if (distToLeft < this.boundaryThreshold) {
      avoidance.x += this.avoidanceForce * (this.boundaryThreshold - distToLeft) / this.boundaryThreshold;
    }
    
    // Avoid right boundary
    if (distToRight < this.boundaryThreshold) {
      avoidance.x -= this.avoidanceForce * (this.boundaryThreshold - distToRight) / this.boundaryThreshold;
    }
    
    // Avoid top boundary
    if (distToTop < this.boundaryThreshold) {
      avoidance.y += this.avoidanceForce * (this.boundaryThreshold - distToTop) / this.boundaryThreshold;
    }
    
    // Avoid bottom boundary
    if (distToBottom < this.boundaryThreshold) {
      avoidance.y -= this.avoidanceForce * (this.boundaryThreshold - distToBottom) / this.boundaryThreshold;
    }
    
    return avoidance;
  }
  
  onEnter(mob: Mob, context: AIContext): void {
    console.log(`🚧 Mob ${mob.id} is avoiding boundaries`);
  }
  
  onExit(mob: Mob, context: AIContext): void {
    console.log(`🚧 Mob ${mob.id} is no longer avoiding boundaries`);
  }
}
