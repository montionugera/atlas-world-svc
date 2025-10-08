/**
 * Idle Behavior
 * Mob stays in place with minimal movement
 */

import { BaseBehavior } from '../core/AIBehavior';
import { AIContext } from '../core/AIContext';
import { Mob } from '../../schemas/Mob';

export class IdleBehavior extends BaseBehavior {
  readonly name = 'idle';
  readonly priority = 0; // Lowest priority
  
  private idleStartTime = 0;
  private minIdleDuration = 3000; // 3 seconds minimum
  private maxIdleDuration = 8000; // 8 seconds maximum
  private idleDuration = 0;
  
  canExecute(context: AIContext): boolean {
    // Can idle if no players nearby and not in alert state
    const hasNearbyPlayers = context.nearbyPlayers.length > 0;
    const isAlert = context.currentState === 'alert';
    
    return !hasNearbyPlayers && !isAlert;
  }
  
  execute(mob: Mob, context: AIContext): any {
    const now = Date.now();
    
    // Initialize idle duration if just started
    if (this.idleStartTime === 0) {
      this.idleStartTime = now;
      this.idleDuration = this.minIdleDuration + Math.random() * (this.maxIdleDuration - this.minIdleDuration);
    }
    
    // Check if idle period is over
    if (now - this.idleStartTime > this.idleDuration) {
      // Return to wandering
      return this.createDecision({ x: 0, y: 0 });
    }
    
    // Very slow random movement while idle
    const velocity = {
      x: (Math.random() - 0.5) * 0.5, // Very slow
      y: (Math.random() - 0.5) * 0.5
    };
    
    return this.createDecision(velocity);
  }
  
  onEnter(mob: Mob, context: AIContext): void {
    console.log(`😴 Mob ${mob.id} is now idle`);
    this.idleStartTime = Date.now();
  }
  
  onExit(mob: Mob, context: AIContext): void {
    console.log(`😴 Mob ${mob.id} is no longer idle`);
    this.idleStartTime = 0;
  }
}
