import { BaseBehavior } from '../core/AIBehavior';
import { AIContext } from '../core/AIContext';
import { Mob } from '../../schemas/Mob';
import { GAME_CONFIG } from '../../config/gameConfig';

export class AttackBehavior extends BaseBehavior {
  readonly name = 'attack';
  readonly priority = 5; // Highest priority - overrides all other behaviors

  private attackRange = 20; // units
  private attackDuration = 5000; // 5 seconds in milliseconds
  private attackStartTime: number = 0;
  private isAttacking: boolean = false;

  canExecute(context: AIContext): boolean {
    if (!context || !context.selfMob) return false;
    if (!context.nearbyPlayers || context.nearbyPlayers.length === 0) return false;

    const mob = context.selfMob;
    const currentTime = Date.now();

    // Check if we're already attacking and within duration
    if (this.isAttacking && (currentTime - this.attackStartTime) < this.attackDuration) {
      return true; // Continue attacking
    }

    // Check if we should start attacking (player within range)
    const nearestPlayer = context.nearbyPlayers.reduce((nearest, player) => {
      const dist = this.distance(mob.x, mob.y, player.x, player.y);
      return dist < this.distance(mob.x, mob.y, nearest.x, nearest.y) ? player : nearest;
    });

    const distanceToPlayer = this.distance(mob.x, mob.y, nearestPlayer.x, nearestPlayer.y);
    
    // Start attacking if player is within attack range
    if (distanceToPlayer <= this.attackRange) {
      this.isAttacking = true;
      this.attackStartTime = currentTime;
      return true;
    }

    // Reset attacking state if we're far from any player
    if (this.isAttacking && distanceToPlayer > this.attackRange * 2) {
      this.isAttacking = false;
    }

    return false;
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

    // During attack, move toward player more aggressively
    const dx = nearest.x - mob.x;
    const dy = nearest.y - mob.y;
    const mag = Math.hypot(dx, dy) || 1;

    // Attack speed is faster than chase speed
    const attackSpeed = Math.min(GAME_CONFIG.mobSpeedRange * 0.8, 32);
    const vx = (dx / mag) * attackSpeed;
    const vy = (dy / mag) * attackSpeed;

    // No logs to avoid spam

    return this.createDecision({ x: vx, y: vy });
  }

  private distance(ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
