/**
 * WorldLife - Base class for living entities in the world
 * Represents entities that can move, have health, and can attack
 */

import { Schema, type, ArraySchema } from "@colyseus/schema";
import { WorldObject } from "./WorldObject";

export abstract class WorldLife extends WorldObject {
  // Physical properties
  @type("number") radius: number = 4;
  
  // Health system
  @type("number") maxHealth: number = 100;
  @type("number") currentHealth: number = 100;
  @type("boolean") isAlive: boolean = true;
  
  // Attack system
  @type("number") attackDamage: number = 10;
  @type("number") attackRange: number = 5;
  @type("number") attackDelay: number = 1000; // milliseconds between attacks
  @type("number") lastAttackTime: number = 0;
  
  // Defense system
  @type("number") defense: number = 0; // Reduces incoming damage
  @type("number") armor: number = 0; // Additional damage reduction
  
  // Impulse system (calculated from damage)
  @type("number") density: number = 1; // Material density for mass calculation
  
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
  
  // Calculate mass from radius and density (mass = volume * density)
  getMass(): number {
    // Volume of sphere = (4/3) * π * r³
    const volume = (4/3) * Math.PI * Math.pow(this.radius, 3);
    return volume * this.density;
  }
  
  // Calculate attack impulse from damage
  getAttackImpulse(): number {
    const { GAME_CONFIG } = require('../config/gameConfig');
    const impulse = this.attackDamage * GAME_CONFIG.attackImpulseMultiplier;
    return Math.max(GAME_CONFIG.minImpulse, Math.min(impulse, GAME_CONFIG.maxImpulse));
  }
  
  // Calculate recoil impulse from damage
  getRecoilImpulse(): number {
    const { GAME_CONFIG } = require('../config/gameConfig');
    const impulse = this.attackDamage * GAME_CONFIG.recoilImpulseMultiplier;
    return Math.max(GAME_CONFIG.minImpulse, Math.min(impulse, GAME_CONFIG.maxImpulse));
  }
  
  constructor(
    id: string,
    x: number,
    y: number,
    vx: number = 0,
    vy: number = 0,
    tags: string[] = [],
    radius: number = 4,
    maxHealth: number = 100,
    attackDamage: number = 10,
    attackRange: number = 5,
    attackDelay: number = 1000,
    defense: number = 0,
    armor: number = 0,
    density: number = 1
  ) {
    super(id, x, y, vx, vy, tags);
    this.radius = radius;
    this.maxHealth = maxHealth;
    this.currentHealth = maxHealth;
    this.attackDamage = attackDamage;
    this.attackRange = attackRange;
    this.attackDelay = attackDelay;
    this.defense = defense;
    this.armor = armor;
    this.density = density;
    this.lastAttackTime = 0;
  }
  
  // Health management with defense calculations
  takeDamage(damage: number, attacker?: WorldLife): boolean {
    if (!this.isAlive || this.isInvulnerable) return false;
    
    // Calculate damage reduction from defense and armor
    const totalDefense = this.defense + this.armor;
    const damageReduction = Math.min(totalDefense, damage * 0.8); // Cap at 80% reduction
    const finalDamage = Math.max(1, damage - damageReduction); // Minimum 1 damage
    
    console.log(`💔 DAMAGE: ${this.id} took ${finalDamage} damage (${damage} - ${damageReduction} reduction), HP: ${this.currentHealth} → ${this.currentHealth - finalDamage}`);
    
    this.currentHealth = Math.max(0, this.currentHealth - finalDamage);
    
    if (this.currentHealth <= 0) {
      this.die();
      return true; // Entity died
    }
    
    // Trigger invulnerability frames (optional)
    if (finalDamage > 0) {
      this.triggerInvulnerability(100); // 100ms invulnerability (reduced from 500ms)
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
    
    // Calculate attack direction for impulse
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distanceToTarget = Math.hypot(dx, dy) || 1;
    const attackDirection = {
      x: dx / distanceToTarget,
      y: dy / distanceToTarget
    };
    
    // Apply damage to target (with defense calculation)
    const targetDied = target.takeDamage(this.attackDamage, this);
    
    // Apply impulse to target (knockback) - calculated from damage
    const attackImpulse = this.getAttackImpulse();
    if (attackImpulse > 0) {
      const targetMass = target.getMass(); // Calculate target mass from size and density
      const targetImpulse = attackImpulse / targetMass; // Heavier targets resist more
      target.vx += attackDirection.x * targetImpulse;
      target.vy += attackDirection.y * targetImpulse;
    }
    
    // Apply recoil impulse to attacker (knockback) - calculated from damage
    const recoilImpulse = this.getRecoilImpulse();
    if (recoilImpulse > 0) {
      const attackerMass = this.getMass(); // Calculate attacker mass from size and density
      const attackerImpulse = recoilImpulse / attackerMass; // Heavier attackers resist more
      this.vx -= attackDirection.x * attackerImpulse;
      this.vy -= attackDirection.y * attackerImpulse;
    }
    
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
  
  // Smart heading update - automatically chooses best source
updateHeading(vx?: number, vy?: number): void {
    let sourceVx: number, sourceVy: number, threshold: number;
    
    if (vx !== undefined && vy !== undefined) {
      // Use provided direction (e.g., target direction)
      sourceVx = vx;
      sourceVy = vy;
      threshold = 0.1; // Higher threshold for explicit directions
    } else {
      // Use AI desired direction (for mobs) or actual velocity (for players)
      if ('desiredVx' in this && 'desiredVy' in this) {
        // Mob: use AI desired direction
        sourceVx = (this as any).desiredVx;
        sourceVy = (this as any).desiredVy;
      } else {
        // Player: use actual velocity
        sourceVx = this.vx;
        sourceVy = this.vy;
      }
      threshold = 0.01; // Lower threshold for AI intent
    }
    
    const magnitude = Math.hypot(sourceVx, sourceVy);
    if (magnitude > threshold) {
      this.heading = Math.atan2(sourceVy, sourceVx);
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
    
    // Use appropriate heading update method
    if ('updateHeadingToTarget' in this) {
      // Mob: use target-based heading
      (this as any).updateHeadingToTarget();
    } else if ('updateHeadingFromInput' in this) {
      // Player: use input-based heading
      (this as any).updateHeadingFromInput();
    } else {
      // Fallback: use velocity-based heading
      this.updateHeading();
    }
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
