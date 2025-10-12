/**
 * WorldLife - Base class for living entities in the world
 * Represents entities that can move, have health, and can attack
 */

import { Schema, type, ArraySchema } from "@colyseus/schema";
import { WorldObject } from "./WorldObject";

export abstract class WorldLife extends WorldObject {
  // Health system
  @type("number") maxHealth: number = 100;
  @type("number") currentHealth: number = 100;
  @type("boolean") isAlive: boolean = true;
  
  // Attack system
  @type("number") attackDamage: number = 10;
  @type("number") attackRange: number = 5;
  @type("number") attackDelay: number = 1000; // milliseconds between attacks
  @type("number") lastAttackTime: number = 0;
  
    // Movement and combat state
    @type("boolean") isAttacking: boolean = false;
    @type("boolean") isMoving: boolean = false;
    @type("string") lastAttackedTarget: string = "";
    
    // Heading direction (in radians) - based on latest movement
    @type("number") heading: number = 0;
  
  // Server-only properties (not synced to clients)
  attackCooldown: number = 0;
  isInvulnerable: boolean = false;
  invulnerabilityDuration: number = 0;
  
  constructor(
    id: string,
    x: number,
    y: number,
    vx: number = 0,
    vy: number = 0,
    tags: string[] = [],
    maxHealth: number = 100,
    attackDamage: number = 10,
    attackRange: number = 5,
    attackDelay: number = 1000
  ) {
    super(id, x, y, vx, vy, tags);
    this.maxHealth = maxHealth;
    this.currentHealth = maxHealth;
    this.attackDamage = attackDamage;
    this.attackRange = attackRange;
    this.attackDelay = attackDelay;
    this.lastAttackTime = 0;
  }
  
  // Health management
  takeDamage(damage: number, attacker?: WorldLife): boolean {
    if (!this.isAlive || this.isInvulnerable) return false;
    
    this.currentHealth = Math.max(0, this.currentHealth - damage);
    
    if (this.currentHealth <= 0) {
      this.die();
      return true; // Entity died
    }
    
    // Trigger invulnerability frames (optional)
    if (damage > 0) {
      this.triggerInvulnerability(500); // 500ms invulnerability
    }
    
    return false; // Entity survived
  }
  
  heal(amount: number): boolean {
    if (!this.isAlive) return false;
    
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    return true;
  }
  
  die(): void {
    this.isAlive = false;
    this.currentHealth = 0;
    this.isAttacking = false;
    this.isMoving = false;
    this.vx = 0;
    this.vy = 0;
  }
  
  respawn(x?: number, y?: number): void {
    this.isAlive = true;
    this.currentHealth = this.maxHealth;
    this.isAttacking = false;
    this.isMoving = false;
    this.vx = 0;
    this.vy = 0;
    this.lastAttackTime = 0;
    this.attackCooldown = 0;
    this.isInvulnerable = false;
    this.invulnerabilityDuration = 0;
    
    if (x !== undefined && y !== undefined) {
      this.x = x;
      this.y = y;
    }
  }
  
  // Attack system with anti-spam protection
  canAttack(): boolean {
    if (!this.isAlive) return false;
    
    const now = Date.now();
    const timeSinceLastAttack = now - this.lastAttackTime;
    
    return timeSinceLastAttack >= this.attackDelay;
  }
  
  attack(target: WorldLife): boolean {
    if (!this.canAttack() || !target.isAlive) return false;
    
    const distance = this.getDistanceTo(target);
    if (distance > this.attackRange) return false;
    
    const now = Date.now();
    this.lastAttackTime = now;
    this.lastAttackedTarget = target.id;
    this.isAttacking = true;
    
    // Apply damage to target
    const targetDied = target.takeDamage(this.attackDamage, this);
    
    // Reset attacking state after a brief moment
    setTimeout(() => {
      this.isAttacking = false;
    }, 200); // 200ms attack animation
    
    return targetDied;
  }
  
  // Utility methods
  getDistanceTo(other: WorldLife): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  getHealthPercentage(): number {
    return this.maxHealth > 0 ? (this.currentHealth / this.maxHealth) * 100 : 0;
  }
  
  isInRange(target: WorldLife): boolean {
    return this.getDistanceTo(target) <= this.attackRange;
  }
  
  // Invulnerability system
  triggerInvulnerability(duration: number): void {
    this.isInvulnerable = true;
    this.invulnerabilityDuration = duration;
    
    setTimeout(() => {
      this.isInvulnerable = false;
      this.invulnerabilityDuration = 0;
    }, duration);
  }
  
  // Update heading based on movement direction
  updateHeading(vx: number, vy: number): void {
    const magnitude = Math.hypot(vx, vy);
    if (magnitude > 0.1) { // Only update if moving with some speed
      this.heading = Math.atan2(vy, vx);
    }
  }

  // Update heading based on AI desired direction (for mobs)
  updateHeadingFromAI(desiredVx: number, desiredVy: number): void {
    const magnitude = Math.hypot(desiredVx, desiredVy);
    if (magnitude > 0.01) { // Lower threshold for AI decisions - mobs should always show intent
      this.heading = Math.atan2(desiredVy, desiredVx);
    }
  }

  // Update method for server-side logic
  update(deltaTime: number): void {
    // Update invulnerability
    if (this.isInvulnerable && this.invulnerabilityDuration > 0) {
      this.invulnerabilityDuration -= deltaTime;
      if (this.invulnerabilityDuration <= 0) {
        this.isInvulnerable = false;
        this.invulnerabilityDuration = 0;
      }
    }
    
    // Update attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }
    
    // Update movement state and heading
    this.isMoving = Math.hypot(this.vx, this.vy) > 0;
    this.updateHeading(this.vx, this.vy);
  }
  
  // Override applyBoundaryPhysics for living entities
  applyBoundaryPhysics(width: number = 400, height: number = 300): void {
    // Living entities bounce off boundaries instead of clamping
    if (this.x <= 0 || this.x >= width) {
      this.vx = -this.vx * 0.8; // Bounce with some energy loss
      this.x = Math.max(0, Math.min(width, this.x));
    }
    if (this.y <= 0 || this.y >= height) {
      this.vy = -this.vy * 0.8; // Bounce with some energy loss
      this.y = Math.max(0, Math.min(height, this.y));
    }
  }
}
