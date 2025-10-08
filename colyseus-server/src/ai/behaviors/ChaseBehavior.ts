import { BaseBehavior } from '../core/AIBehavior';
import { AIContext } from '../core/AIContext';
import { Mob } from '../../schemas/Mob';
import { GAME_CONFIG } from '../../config/gameConfig';

export class ChaseBehavior extends BaseBehavior {
  readonly name = 'chase';
  readonly priority = 4; // Higher than wander and boundary-aware

  private detectionRadius = 50; // units
  private chaseSpeed = Math.min(GAME_CONFIG.mobSpeedRange * 0.5, 24); // slower cap to avoid overshoot

  canExecute(context: AIContext): boolean {
    if (!context || !context.selfMob) return false;
    if (!context.nearbyPlayers || context.nearbyPlayers.length === 0) return false;
    
    const mob = context.selfMob;
    const nearestPlayer = context.nearbyPlayers.reduce((nearest, player) => {
      const dist = this.distance(mob.x, mob.y, player.x, player.y);
      return dist < this.distance(mob.x, mob.y, nearest.x, nearest.y) ? player : nearest;
    });
    
    const distanceToPlayer = this.distance(mob.x, mob.y, nearestPlayer.x, nearestPlayer.y);
    
    // Only chase if player is within detection range AND not too close
    return distanceToPlayer <= this.detectionRadius && distanceToPlayer >= 10;
  }

  execute(mob: Mob, context: AIContext) {
    if (!mob || !context || !context.nearbyPlayers || context.nearbyPlayers.length === 0) {
      return this.createDecision({ x: mob?.vx ?? 0, y: mob?.vy ?? 0 });
    }

    // Find nearest player
    let nearest = context.nearbyPlayers[0];
    let nearestDist = this.distance(mob.x, mob.y, nearest.x, nearest.y);
    for (let i = 1; i < context.nearbyPlayers.length; i++) {
      const p = context.nearbyPlayers[i];
      const d = this.distance(mob.x, mob.y, p.x, p.y);
      if (d < nearestDist) {
        nearest = p;
        nearestDist = d;
      }
    }

    // Direction towards player
    const dx = nearest.x - mob.x;
    const dy = nearest.y - mob.y;
    const mag = Math.hypot(dx, dy) || 1;

    // Stop if within 10 units to avoid slipping around the target
    if (mag < 10) {
      return this.createDecision({ x: 0, y: 0 });
    }
    const vx = (dx / mag) * this.chaseSpeed;
    const vy = (dy / mag) * this.chaseSpeed;

    return this.createDecision({ x: vx, y: vy });
  }

  private distance(ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }
}


