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
  currentChaseTarget: string = ""; // ID of the player currently being chased
  targetX: number = 0; // Current target position X
  targetY: number = 0; // Current target position Y
  wanderTargetX: number = 0; // Wander target position X
  wanderTargetY: number = 0; // Wander target position Y
  lastWanderTargetTime: number = 0; // When wander target was last set

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

  // Simple behavior: just distance-based with cooldown
  decideBehavior(env: {
    nearestPlayer?: { x: number; y: number; id: string } | null;
    distanceToNearestPlayer?: number;
    nearBoundary?: boolean;
  }) {
    const now = Date.now();
    
    // Simple cooldown to prevent rapid switching
    if (this.behaviorLockedUntil && now < this.behaviorLockedUntil) {
      return this.currentBehavior;
    }
    
    const distance = env.distanceToNearestPlayer ?? Infinity;
    const oldBehavior = this.currentBehavior;
    
    // Check boundary first (highest priority)
    if (env.nearBoundary) {
      // Near boundary: Avoid boundary behavior
      this.currentBehavior = "avoidBoundary";
      this.behaviorLockedUntil = now + 500; // 0.5 second lock
      this.currentAttackTarget = "";
      this.currentChaseTarget = "";
    } else if (distance <= 12) {
      // Very close: Attack
      this.currentBehavior = "attack";
      this.behaviorLockedUntil = now + 1000; // 1 second lock
      if (env.nearestPlayer) {
        this.currentAttackTarget = env.nearestPlayer.id || "unknown";
      }
      this.currentChaseTarget = "";
    } else if (distance <= 25) {
      // Medium: Chase  
      this.currentBehavior = "chase";
      this.behaviorLockedUntil = now + 800; // 0.8 second lock
      if (env.nearestPlayer) {
        this.currentChaseTarget = env.nearestPlayer.id || "unknown";
      }
      this.currentAttackTarget = "";
    } else {
      // Far: Wander
      this.currentBehavior = "wander";
      this.currentAttackTarget = "";
      this.currentChaseTarget = "";
    }
    
    this.tag = this.currentBehavior;
    
    // Log only when behavior actually changes
    if (oldBehavior !== this.currentBehavior) {
      console.log(`🔄 BEHAVIOR: ${this.id} ${oldBehavior} → ${this.currentBehavior.toUpperCase()}`);
    }
    
    return this.currentBehavior;
  }

  // Compute desired velocity based on currentBehavior
  computeDesiredVelocity(env: {
    nearestPlayer?: { x: number; y: number; id: string } | null;
    distanceToNearestPlayer?: number;
    maxSpeed?: number;
    worldBounds?: { width: number; height: number };
  }): { x: number; y: number } {
    const maxSpeed = env.maxSpeed ?? 24;
    
    // Avoid boundary behavior: move away from nearest boundary
    if (this.currentBehavior === "avoidBoundary") {
      const worldWidth = env.worldBounds?.width ?? 400;
      const worldHeight = env.worldBounds?.height ?? 300;
      
      // Calculate avoidance force based on distance to each boundary
      let avoidX = 0, avoidY = 0;
      const boundaryThreshold = 30;
      
      // Avoid left boundary
      if (this.x < boundaryThreshold) {
        avoidX += (boundaryThreshold - this.x) / boundaryThreshold;
      }
      
      // Avoid right boundary
      if (this.x > worldWidth - boundaryThreshold) {
        avoidX -= (this.x - (worldWidth - boundaryThreshold)) / boundaryThreshold;
      }
      
      // Avoid top boundary
      if (this.y < boundaryThreshold) {
        avoidY += (boundaryThreshold - this.y) / boundaryThreshold;
      }
      
      // Avoid bottom boundary
      if (this.y > worldHeight - boundaryThreshold) {
        avoidY -= (this.y - (worldHeight - boundaryThreshold)) / boundaryThreshold;
      }
      
      // Normalize and apply speed
      const magnitude = Math.hypot(avoidX, avoidY);
      if (magnitude > 0) {
        const speed = Math.min(maxSpeed * 0.7, 20); // Moderate speed for avoidance
        return { 
          x: (avoidX / magnitude) * speed, 
          y: (avoidY / magnitude) * speed 
        };
      }
      
      // If no clear direction, move toward center
      const centerX = worldWidth / 2;
      const centerY = worldHeight / 2;
      const dx = centerX - this.x;
      const dy = centerY - this.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const speed = Math.min(maxSpeed * 0.5, 15);
        return { x: (dx / distance) * speed, y: (dy / distance) * speed };
      }
      
      return { x: 0, y: 0 };
    }
    
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
    
    // Wander behavior: move toward wander target
    if (this.currentBehavior === "wander") {
      const now = Date.now();
      const wanderCooldown = 2000; // 2 seconds
      
      // Generate new wander target if needed
      if (now - this.lastWanderTargetTime > wanderCooldown || 
          Math.hypot(this.wanderTargetX - this.x, this.wanderTargetY - this.y) < 5) {
        this.generateWanderTarget();
        this.lastWanderTargetTime = now;
      }
      
      // Move toward wander target
      const dx = this.wanderTargetX - this.x;
      const dy = this.wanderTargetY - this.y;
      const distance = Math.hypot(dx, dy);
      
      if (distance > 0.1) {
        const speed = Math.min(maxSpeed * 0.6, 15); // Slower wander speed
        return { x: (dx / distance) * speed, y: (dy / distance) * speed };
      }
    }
    
    // Fallback: keep current velocity with slight damping
    return { x: this.vx * 0.9, y: this.vy * 0.9 };
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

  // Update heading directly from target position
  updateHeadingToTarget(): void {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 0.01) { // Always show intent to target
      this.heading = Math.atan2(dy, dx);
    }
  }

  // Generate a random wander target
  private generateWanderTarget(): void {
    const wanderRadius = 30;
    const wanderDistance = 20;
    const wanderJitter = 10;
    
    // Generate random point around current position
    const angle = Math.random() * Math.PI * 2;
    const distance = wanderDistance + Math.random() * wanderJitter;
    
    this.wanderTargetX = this.x + Math.cos(angle) * distance;
    this.wanderTargetY = this.y + Math.sin(angle) * distance;
    
    // Keep within world bounds (assuming 400x300 world)
    this.wanderTargetX = Math.max(20, Math.min(380, this.wanderTargetX));
    this.wanderTargetY = Math.max(20, Math.min(280, this.wanderTargetY));
  }
}
