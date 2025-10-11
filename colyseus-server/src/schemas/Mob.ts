import { type } from "@colyseus/schema";
import { WorldLife } from "./WorldLife";

export class Mob extends WorldLife {
  @type("number") radius: number = 4;
  @type("string") tag: string = "idle"; // Current behavior tag for debugging/UI // Send radius to client
  @type("string") currentBehavior: string = "idle";
  @type("number") behaviorLockedUntil: number = 0; // epoch ms; 0 means unlocked
  // Server-only fields (not synced to clients)
  mass: number = 1; // cached mass for steering calculations
  desiredVx: number = 0;
  desiredVy: number = 0;
  desiredBehavior: string = "idle";
  decisionTimestamp: number = 0;
  chaseRange: number = 15; // Chase range buffer (will be calculated with radius)
  currentAttackTarget: string = ""; // ID of the player currently being attacked

  constructor(options: { 
    id: string; 
    x: number; 
    y: number; 
    vx?: number; 
    vy?: number; 
    radius?: number;
    attackRange?: number;
    chaseRange?: number;
    maxHealth?: number;
    attackDamage?: number;
    attackDelay?: number;
  }) {
    super(
      options.id, 
      options.x, 
      options.y, 
      options.vx ?? 0, 
      options.vy ?? 0, 
      ["mob"],
      options.maxHealth ?? 50, // Mobs have less health than players
      options.attackDamage ?? 15, // Mobs deal more damage
      options.attackRange ?? 5, // Use WorldLife attackRange
      options.attackDelay ?? 2000 // Mobs attack slower
    );
    if (options.radius !== undefined) {
      this.radius = options.radius;
    }
    if (options.chaseRange !== undefined) {
      this.chaseRange = options.chaseRange;
    }
  }

  // Override WorldLife update to include AI behavior
  update(deltaTime: number, env?: any, delegate?: { decideBehavior: (mob: Mob, env: any) => void; applyDecision: (mobId: string, velocity: { x: number; y: number }, behavior: string) => void }) {
    // Call parent update for health/invulnerability logic
    super.update(deltaTime);
    
    // AI behavior logic (if delegate provided)
    if (env && delegate) {
      delegate.decideBehavior(this, env);
      const desired = this.computeDesiredVelocity({
        nearestPlayer: env.nearestPlayer ? { x: env.nearestPlayer.x, y: env.nearestPlayer.y, id: env.nearestPlayer.id } : null,
        distanceToNearestPlayer: env.distanceToNearestPlayer,
        maxSpeed: 24
      });
      delegate.applyDecision(this.id, desired, this.currentBehavior);
    }
  }

  // Decide behavior based on simple priorities; respects lock window
  decideBehavior(env: {
    nearestPlayer?: { x: number; y: number; id: string } | null;
    distanceToNearestPlayer?: number;
    nearBoundary?: boolean;
  }) {
    const now = Date.now();
    
    // Calculate effective attack range based on mob radius + attack buffer + player radius
    const effectiveAttackRange = this.radius + this.attackRange + 4; // mob radius + attack range + player radius
    
    
    // Check behavior lock (but allow attack override above)
    if (this.behaviorLockedUntil && now < this.behaviorLockedUntil) {
      this.tag = this.currentBehavior;
      return this.currentBehavior;
    }
    
    // Calculate effective chase range based on mob radius + chase buffer + player radius
    const effectiveChaseRange = this.radius + this.chaseRange + 4; // mob radius + chase range + player radius
    
    // PRIORITY 1: Attack if very close to player (highest priority)
    if ((env.distanceToNearestPlayer ?? Infinity) <= effectiveAttackRange) {
      this.currentBehavior = "attack";
      this.behaviorLockedUntil = now + 1000; // 1 second lock for attack
      // Set the attack target to the nearest player
      if (env.nearestPlayer) {
        this.currentAttackTarget = env.nearestPlayer.id || "unknown";
      }
      this.tag = this.currentBehavior;
      return this.currentBehavior;
    }

    // PRIORITY 2: Chase if within chase range but outside attack range
    if ((env.distanceToNearestPlayer ?? Infinity) <= effectiveChaseRange && (env.distanceToNearestPlayer ?? Infinity) > effectiveAttackRange) {
      this.currentBehavior = "chase";
      this.currentAttackTarget = ""; // Clear attack target when switching to chase
      this.tag = this.currentBehavior;
      return this.currentBehavior;
    }

    // PRIORITY 3: Boundary awareness (only if no player nearby)
    if (env.nearBoundary && (env.distanceToNearestPlayer ?? Infinity) > effectiveChaseRange) {
      this.currentBehavior = "boundaryAware";
      this.currentAttackTarget = ""; // Clear attack target when switching to boundary awareness
      this.tag = this.currentBehavior;
      return this.currentBehavior;
    }

    this.currentBehavior = "wander";
    this.currentAttackTarget = ""; // Clear attack target when switching to wander
    this.tag = this.currentBehavior;
    return this.currentBehavior;
  }

  // Compute desired velocity based on currentBehavior
  computeDesiredVelocity(env: {
    nearestPlayer?: { x: number; y: number; id: string } | null;
    distanceToNearestPlayer?: number;
    maxSpeed?: number;
  }): { x: number; y: number } {
    const maxSpeed = env.maxSpeed ?? 24;
    
    // Attack behavior: stop moving (stand and attack)
    if (this.currentBehavior === "attack") {
      return { x: 0, y: 0 };
    }
    
    // Chase behavior: move toward player
    if (this.currentBehavior === "chase") {
      const target = env.nearestPlayer;
      if (target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const m = Math.hypot(dx, dy) || 1;
        const speed = Math.min(maxSpeed * 0.8, 24);
        return { x: (dx / m) * speed, y: (dy / m) * speed };
      }
    }
    
    // Wander fallback: keep current velocity with slight damping
    return { x: this.vx, y: this.vy };
  }

  // Compute steering impulse to move current physics velocity toward desired velocity
  // Returns an impulse vector already scaled by mass and clamped
  computeSteeringImpulse(params: {
    currentVelocity: { x: number; y: number };
    desiredVelocity: { x: number; y: number };
    mass: number;
    gain?: number; // tuning factor for responsiveness
    maxImpulsePerTick?: number; // safety clamp
  }): { x: number; y: number } {
    const { currentVelocity, desiredVelocity, mass } = params;
    const gain = params.gain ?? 0.2;
    const maxImpulse = params.maxImpulsePerTick ?? mass * 1.0;
    const steerX = desiredVelocity.x - currentVelocity.x;
    const steerY = desiredVelocity.y - currentVelocity.y;
    let impulseX = steerX * mass * gain;
    let impulseY = steerY * mass * gain;
    const mag = Math.hypot(impulseX, impulseY);
    if (mag > maxImpulse) {
      const s = maxImpulse / (mag || 1);
      impulseX *= s;
      impulseY *= s;
    }
    return { x: impulseX, y: impulseY };
  }

  // Override boundary physics for mobs (bounce instead of clamp)
  applyBoundaryPhysics(width: number = 20, height: number = 20) {
    // Bounce off walls
    if (this.x <= 0 || this.x >= width) {
      this.vx = -this.vx;
      this.x = Math.max(0, Math.min(width, this.x));
    }
    if (this.y <= 0 || this.y >= height) {
      this.vy = -this.vy;
      this.y = Math.max(0, Math.min(height, this.y));
    }
  }
}
