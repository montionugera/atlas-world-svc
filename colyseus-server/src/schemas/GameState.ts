import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import { Mob } from "./Mob";
import { Player } from "./Player";
import { GAME_CONFIG } from "../config/gameConfig";
import * as planck from "planck";
import { MobAIModule } from "../ai/MobAIModule";
import { AIWorldInterface } from "../ai/AIWorldInterface";

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Mob }) mobs = new MapSchema<Mob>();
  @type("number") tick: number = 0;
  @type("string") mapId: string = "map-01-sector-a";
  @type("number") width: number = GAME_CONFIG.worldWidth;
  @type("number") height: number = GAME_CONFIG.worldHeight;

  private aiModule: MobAIModule;
  public worldInterface: AIWorldInterface;

  constructor(mapId: string = "map-01-sector-a") {
    super();
    this.mapId = mapId;
    this.width = GAME_CONFIG.worldWidth;
    this.height = GAME_CONFIG.worldHeight;
    this.tick = 0;
    
    // Initialize AI module
    this.worldInterface = new AIWorldInterface(this);
    this.aiModule = new MobAIModule(this.worldInterface);
    this.aiModule.start();
    
    // Initialize mobs and register with AI
    this.initializeMobs();
  }

  // Initialize mobs with random positions and velocities
  private initializeMobs() {
    this.mobs.clear();
    
    for (let i = 1; i <= GAME_CONFIG.mobCount; i++) {
      // Spawn mobs spread out across the map with more margin from boundaries
      const x = Math.random() * (this.width - 40) + 20; // More margin from boundaries
      const y = Math.random() * (this.height - 40) + 20; // More margin from boundaries
      const vx = (Math.random() - 0.5) * GAME_CONFIG.mobSpeedRange;
      const vy = (Math.random() - 0.5) * GAME_CONFIG.mobSpeedRange;
      
      const rand2 = Math.random().toString(36).slice(2, 4); // 2 random chars
      const mobId = `mob-${i}-${rand2}`; // index + 2 random chars
      const radius = 1 + 3 * Math.random(); // example variability
      
      // Create different mob types with different ranges
      const mobType = Math.random();
      let attackRange = 1.5; // Default attack range buffer
      let chaseRange = 15; // Default chase range buffer
      
      if (mobType < 0.3) {
        // Aggressive mobs - longer attack range and chase range
        attackRange = 2.5;
        chaseRange = 25;
      } else if (mobType < 0.6) {
        // Defensive mobs - shorter attack range and chase range
        attackRange = 1.0;
        chaseRange = 10;
      }
      // Default ranges for balanced mobs (0.6-1.0)
      
      const mob = new Mob({ 
        id: mobId, 
        x, 
        y, 
        vx, 
        vy, 
        radius,
        attackRange,
        chaseRange
      });
      this.mobs.set(mobId, mob);
      
      // Register mob with AI module
      this.aiModule.registerMob(mob, {
        behaviors: ['attack', 'chase', 'wander', 'boundaryAware', 'idle'],
        perception: { range: 50, fov: 120 },
        memory: { duration: 5000 }
      });
    }
  }

  // Add a player to the game
  addPlayer(sessionId: string, name: string) {
    // Spawn new players at map center for visibility
    const spawnX = this.width / 2;
    const spawnY = this.height / 2;
    const player = new Player(sessionId, name, spawnX, spawnY);
    this.players.set(sessionId, player);
    return player;
  }

  // Remove a player from the game
  removePlayer(sessionId: string) {
    this.players.delete(sessionId);
  }

  // Get a player by session ID
  getPlayer(sessionId: string): Player | undefined {
    return this.players.get(sessionId);
  }

  // Update mobs (physics-based movement for collision detection)
  updateMobs(physicsManager?: any) {
    for (const mob of this.mobs.values()) {
      // Update mob AI behavior first (changes mob.vx, mob.vy)
      this.updateMobAI(mob);
      
      if (physicsManager) {
        const mobBody = physicsManager.getBody(mob.id);
        if (mobBody) {
          // Steering impulse: let mob compute based on current/desired velocity
        const currentVel = mobBody.getLinearVelocity();
          const desired = { x: mob.desiredVx, y: mob.desiredVy };
          const mass = mob.mass = mobBody.getMass();
          const impulse = mob.computeSteeringImpulse({
            currentVelocity: { x: currentVel.x, y: currentVel.y },
            desiredVelocity: desired,
            mass,
            gain: 0.2,
            maxImpulsePerTick: mass * 1.0
          });
          mobBody.applyLinearImpulse(planck.Vec2(impulse.x, impulse.y), mobBody.getWorldCenter(), true);
          
          // Update mob position from physics body
          const pos = mobBody.getPosition();
          mob.x = pos.x;
          mob.y = pos.y;
          
          // Update mob velocity from physics with max speed limit
          const vel = mobBody.getLinearVelocity();
          const maxSpeed = 10; // Maximum speed for mobs
          const currentSpeed = Math.hypot(vel.x, vel.y);
          
          if (currentSpeed > maxSpeed) {
            // Cap velocity to max speed
            const scale = maxSpeed / currentSpeed;
            mob.vx = vel.x * scale;
            mob.vy = vel.y * scale;
            // Apply the capped velocity back to physics body
            mobBody.setLinearVelocity(planck.Vec2(mob.vx, mob.vy));
          } else {
            mob.vx = vel.x;
            mob.vy = vel.y;
          }
          
          // Update mob heading based on behavior and movement
          const velocityMagnitude = Math.hypot(mob.vx, mob.vy);
          const desiredMagnitude = Math.hypot(mob.desiredVx, mob.desiredVy);
          
          // Special case: During attack behavior, always point toward the specific attack target
          if (mob.currentBehavior === "attack") {
            // Find the specific player being attacked
            const attackTarget = this.players.get(mob.currentAttackTarget);
            if (attackTarget) {
              const dx = attackTarget.x - mob.x;
              const dy = attackTarget.y - mob.y;
              const distance = Math.hypot(dx, dy);
              if (distance > 0) {
                // Point toward the specific attack target
                mob.updateHeading(dx, dy);
              }
            } else {
              // Fallback to nearest player if attack target not found
              const nearestPlayer = this.findNearestPlayer(mob);
              if (nearestPlayer) {
                const dx = nearestPlayer.x - mob.x;
                const dy = nearestPlayer.y - mob.y;
                const distance = Math.hypot(dx, dy);
                if (distance > 0) {
                  mob.updateHeading(dx, dy);
                }
              } else {
                // Final fallback to actual velocity
                mob.updateHeading(mob.vx, mob.vy);
              }
            }
          }
          // If mob is moving fast (being pushed by physics), show actual direction
          else if (velocityMagnitude > 2.0) {
            mob.updateHeading(mob.vx, mob.vy);
          } else if (desiredMagnitude > 0.1) {
            // If not being pushed, show AI intent
            mob.updateHeadingFromAI(mob.desiredVx, mob.desiredVy);
          } else {
            // Fallback to actual velocity
            mob.updateHeading(mob.vx, mob.vy);
          }
          mob.update(GAME_CONFIG.tickRate);
          
               // Log mob movement every 500 ticks to reduce spam
               if (this.tick % 500 === 0) {
                 console.log(`🏃 MOB ${mob.id}: pos(${mob.x.toFixed(1)}, ${mob.y.toFixed(1)}) vel(${mob.vx.toFixed(1)}, ${mob.vy.toFixed(1)}) desired(${mob.desiredVx.toFixed(1)}, ${mob.desiredVy.toFixed(1)}) heading(${mob.heading.toFixed(2)})`);
               }
        }
      } else {
        // Fallback to traditional movement if no physics
        mob.updatePosition();
        mob.applyBoundaryPhysics(this.width, this.height);
        // Update mob heading based on AI desired direction (no physics impulse in this case)
        mob.updateHeadingFromAI(mob.desiredVx, mob.desiredVy);
        mob.update(GAME_CONFIG.tickRate);
      }
    }
    
    
    this.tick++;
  }


  // Main AI update method - decides which behavior to use
  private updateMobAI(mob: Mob) {
    // For now, use wander behavior (random movement)
    // Can be extended to use different behaviors based on conditions
    this.updateMobWanderBehavior(mob);
  }

  // Advanced AI: Chase nearest player
  private updateMobChaseBehavior(mob: Mob) {
    const nearestPlayer = this.findNearestPlayer(mob);
    if (nearestPlayer) {
      const dx = nearestPlayer.x - mob.x;
      const dy = nearestPlayer.y - mob.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        // Normalize direction and apply speed
        const speed = GAME_CONFIG.mobSpeedRange;
        mob.vx = (dx / distance) * speed;
        mob.vy = (dy / distance) * speed;
      }
    }
  }

  // Advanced AI: Wander behavior
  private updateMobWanderBehavior(mob: Mob) {
    // Add some randomness to current velocity
    mob.vx += (Math.random() - 0.5) * 0.1;
    mob.vy += (Math.random() - 0.5) * 0.1;
    
    // Limit speed
    const speed = Math.sqrt(mob.vx * mob.vx + mob.vy * mob.vy);
    const maxSpeed = GAME_CONFIG.mobSpeedRange;
    if (speed > maxSpeed) {
      mob.vx = (mob.vx / speed) * maxSpeed;
      mob.vy = (mob.vy / speed) * maxSpeed;
    }
  }

  // Find nearest player to a mob
  private findNearestPlayer(mob: Mob): Player | null {
    let nearestPlayer: Player | null = null;
    let nearestDistance = Infinity;

    for (const player of this.players.values()) {
      const dx = player.x - mob.x;
      const dy = player.y - mob.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPlayer = player;
      }
    }

    return nearestPlayer;
  }



  // Enable different AI behaviors for mobs
  enableMobChaseBehavior() {
    // Update all mobs to use chase behavior
    for (const mob of this.mobs.values()) {
      // This would be called in updateMobAI
      // For now, just a placeholder for future implementation
    }
  }

  // Enable wander behavior for mobs
  enableMobWanderBehavior() {
    // Update all mobs to use wander behavior
    for (const mob of this.mobs.values()) {
      // This would be called in updateMobAI
      // For now, just a placeholder for future implementation
    }
  }

  // Update player position
  updatePlayerPosition(sessionId: string, x: number, y: number) {
    const player = this.getPlayer(sessionId);
    if (player) {
      player.x = x;
      player.y = y;
    }
  }

  // Update player input (movement)
  updatePlayerInput(sessionId: string, vx: number, vy: number) {
    const player = this.getPlayer(sessionId);
    if (player) {
      player.input.setMovement(vx, vy);
    }
  }
  
  // Update player action input
  updatePlayerAction(sessionId: string, action: string, pressed: boolean) {
    const player = this.getPlayer(sessionId);
    if (player) {
      player.input.setAction(action, pressed);
    }
  }
}
