import { Schema, type } from "@colyseus/schema";

export class Mob extends Schema {
  @type("string") id: string;
  @type("number") x: number;
  @type("number") y: number;
  @type("number") vx: number;
  @type("number") vy: number;
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
  attackRange: number = 1.5; // Actual attack range buffer (not AI detection range)
  chaseRange: number = 50; // AI behavior range for chasing
  
  // Physics properties
  @type("string") physicsBodyId: string = "";
  @type("number") angle: number = 0;
  @type("number") angularVelocity: number = 0;
  @type("boolean") isStatic: boolean = false;

  constructor(options: { 
    id: string; 
    x: number; 
    y: number; 
    vx?: number; 
    vy?: number; 
    radius?: number;
    attackRange?: number;
    chaseRange?: number;
  }) {
    super();
    this.id = options.id;
    this.x = options.x;
    this.y = options.y;
    this.vx = options.vx ?? 0;
    this.vy = options.vy ?? 0;
    if (options.radius !== undefined) {
      this.radius = options.radius;
    }
    if (options.attackRange !== undefined) {
      this.attackRange = options.attackRange;
    }
    if (options.chaseRange !== undefined) {
      this.chaseRange = options.chaseRange;
    }
  }

  // World-driven update using a delegate (behavior orchestrator)
  update(env: any, delegate: { decideBehavior: (mob: Mob, env: any) => void; applyDecision: (mobId: string, velocity: { x: number; y: number }, behavior: string) => void }) {
    delegate.decideBehavior(this, env);
    const desired = this.computeDesiredVelocity({
      nearestPlayer: env.nearestPlayer ? { x: env.nearestPlayer.x, y: env.nearestPlayer.y } : null,
      distanceToNearestPlayer: env.distanceToNearestPlayer,
      maxSpeed: 24
    });
    delegate.applyDecision(this.id, desired, this.currentBehavior);
  }

  // Decide behavior based on simple priorities; respects lock window
  decideBehavior(env: {
    nearestPlayer?: { x: number; y: number } | null;
    distanceToNearestPlayer?: number;
    nearBoundary?: boolean;
  }) {
    const now = Date.now();
    if (this.behaviorLockedUntil && now < this.behaviorLockedUntil) {
      this.tag = this.currentBehavior;
      return this.currentBehavior;
    }

    // Calculate effective attack range based on mob radius + attack buffer + player radius
    const effectiveAttackRange = this.radius + this.attackRange + 2; // mob radius + attack range + player radius
    
    // Attack lock example: if very close
    if ((env.distanceToNearestPlayer ?? Infinity) <= effectiveAttackRange) {
      this.currentBehavior = "attack";
      this.behaviorLockedUntil = now + 5000;
      this.tag = this.currentBehavior;
      return this.currentBehavior;
    }

    if ((env.distanceToNearestPlayer ?? Infinity) <= this.chaseRange && (env.distanceToNearestPlayer ?? Infinity) >= 10) {
      this.currentBehavior = "chase";
      this.tag = this.currentBehavior;
      return this.currentBehavior;
    }

    if (env.nearBoundary) {
      this.currentBehavior = "boundaryAware";
      this.tag = this.currentBehavior;
      return this.currentBehavior;
    }

    this.currentBehavior = "wander";
    this.tag = this.currentBehavior;
    return this.currentBehavior;
  }

  // Compute desired velocity based on currentBehavior
  computeDesiredVelocity(env: {
    nearestPlayer?: { x: number; y: number } | null;
    distanceToNearestPlayer?: number;
    maxSpeed?: number;
  }): { x: number; y: number } {
    const maxSpeed = env.maxSpeed ?? 24;
    if (this.currentBehavior === "attack" || this.currentBehavior === "chase") {
      const target = env.nearestPlayer;
      if (target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const m = Math.hypot(dx, dy) || 1;
        const speed = this.currentBehavior === "attack" ? Math.min(maxSpeed, 32) : Math.min(maxSpeed * 0.8, 24);
        return { x: (dx / m) * speed, y: (dy / m) * speed };
      }
    }
    // Wander fallback: keep current velocity with slight damping
    return { x: this.vx, y: this.vy };
  }

  // Helper method to update position
  updatePosition() {
    this.x += this.vx;
    this.y += this.vy;
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

  // Helper method to apply boundary physics
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

  // Physics helper methods
  updateFromPhysicsBody(physicsBody: any) {
    this.x = physicsBody.position.x;
    this.y = physicsBody.position.y;
    this.vx = physicsBody.velocity.x;
    this.vy = physicsBody.velocity.y;
    this.angle = physicsBody.angle;
    this.angularVelocity = physicsBody.angularVelocity;
  }

  syncToPhysicsBody(physicsBody: any) {
    physicsBody.position.x = this.x;
    physicsBody.position.y = this.y;
    physicsBody.velocity.x = this.vx;
    physicsBody.velocity.y = this.vy;
    physicsBody.angle = this.angle;
    physicsBody.angularVelocity = this.angularVelocity;
  }
}
