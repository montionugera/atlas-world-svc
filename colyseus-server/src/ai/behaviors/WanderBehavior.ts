/**
 * Wander Behavior
 * Basic random movement behavior for mobs
 */

import { BaseBehavior } from '../core/AIBehavior';
import { AIContext } from '../core/AIContext';
import { Mob } from '../../schemas/Mob';
import { GAME_CONFIG } from '../../config/gameConfig';

export class WanderBehavior extends BaseBehavior {
  readonly name = 'wander';
  readonly priority = 1;
  
  private wanderRadius = 30;
  private wanderDistance = 20;
  private wanderJitter = 10;
  private wanderTarget?: { x: number; y: number };
  private lastWanderTime = 0;
  private wanderCooldown = 2000; // 2 seconds
  
  canExecute(context: AIContext): boolean {
    // Can always wander if no other high-priority behaviors
    return true;
  }
  
  execute(mob: Mob, context: AIContext): any {
    // Handle invalid inputs gracefully
    if (!mob || !context) {
      return this.createDecision({ x: 0, y: 0 });
    }
    
    const now = Date.now();
    
    // Check if we need a new wander target
    if (!this.wanderTarget || now - this.lastWanderTime > this.wanderCooldown) {
      this.generateWanderTarget(mob, context);
      this.lastWanderTime = now;
    }
    
    // Calculate direction to wander target
    const dx = this.wanderTarget!.x - mob.x;
    const dy = this.wanderTarget!.y - mob.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    let velocity = { x: 0, y: 0 };
    
    if (distance > 5) { // Not at target yet
      // Normalize direction and apply speed
      const speed = Math.min(distance, GAME_CONFIG.mobSpeedRange * 0.8); // Slower wander speed
      velocity = {
        x: (dx / distance) * speed,
        y: (dy / distance) * speed
      };
    } else {
      // At target, generate new one
      this.generateWanderTarget(mob, context);
    }
    
    // Add some randomness to make it more natural
    // velocity.x += (Math.random() - 0.5) * 2;
    // velocity.y += (Math.random() - 0.5) * 2;
    
    return this.createDecision(velocity);
  }
  
  private generateWanderTarget(mob: Mob, context: AIContext): void {
    // Handle invalid inputs gracefully
    if (!mob || !context || !context.worldBounds) {
      this.wanderTarget = { x: mob?.x || 50, y: mob?.y || 50 };
      return;
    }
    
    // Generate a random point within wander radius
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.wanderRadius;
    
    let targetX = mob.x + Math.cos(angle) * distance;
    let targetY = mob.y + Math.sin(angle) * distance;
    
    // Keep within world bounds
    targetX = Math.max(10, Math.min(context.worldBounds.width - 10, targetX));
    targetY = Math.max(10, Math.min(context.worldBounds.height - 10, targetY));
    
    this.wanderTarget = { x: targetX, y: targetY };
    
    // Log wander target occasionally
    if (Math.random() < 0.01) { // 1% chance
      console.log(`🎯 Wander target for ${mob.id}: (${targetX.toFixed(1)}, ${targetY.toFixed(1)})`);
    }
  }
  
  onEnter(mob: Mob, context: AIContext): void {
    console.log(`🚶 Mob ${mob.id} started wandering`);
    this.generateWanderTarget(mob, context);
  }
  
  onExit(mob: Mob, context: AIContext): void {
    console.log(`🚶 Mob ${mob.id} stopped wandering`);
  }
}
