import { Room, Client } from "colyseus";
import { GameState } from "../schemas/GameState";
import { Player } from "../schemas/Player";
import { GAME_CONFIG } from "../config/gameConfig";
import { PlanckPhysicsManager } from "../physics/PlanckPhysicsManager";
import { MAP_CONFIG } from "../config/mapConfig";
import * as planck from "planck"; // For planck.Vec2

export class GameRoom extends Room<GameState> {
  // Room configuration
  maxClients = 1;

  // Simulation settings
  private simulationInterval?: NodeJS.Timeout;
  
  // Physics engine
  private physicsManager!: PlanckPhysicsManager;

  onCreate(options: any) {
    console.log(`🎮 GameRoom created with mapId: ${options.mapId || 'map-01-sector-a'}`);
    
    // Initialize physics manager
    this.physicsManager = new PlanckPhysicsManager();
    
    // Initialize game state
    this.setState(new GameState(options.mapId || 'map-01-sector-a'));

    // Connect physics manager to AI interface
    this.state.worldInterface.setPhysicsManager(this.physicsManager);

    // Set up physics bodies for existing mobs
    this.initializePhysicsBodies();

         // Set up collision callbacks for logging only (no manual physics)
         this.setupCollisionCallbacks();

    // Start simulation loop
    this.startSimulation();

    // Handle player input → apply force to physics body (authoritative physics)
    this.onMessage("player_input", (client: Client, data: { vx: number; vy: number }) => {
      const player = this.state.getPlayer(client.sessionId);
      if (!player) return;
      const { vx, vy } = data || { vx: 0, vy: 0 };
      this.state.updatePlayerInput(client.sessionId, vx, vy);
    });

    this.onMessage("player_position", (client: Client, data: { x: number; y: number }) => {
      const player = this.state.getPlayer(client.sessionId);
      if (player) {
        this.state.updatePlayerPosition(client.sessionId, data.x, data.y);
      }
    });

    // Handle mob AI control messages
    this.onMessage("enable_mob_chase", (client: Client) => {
      this.enableMobChaseBehavior();
      console.log(`🎯 Mob chase behavior enabled by ${client.sessionId}`);
    });

    this.onMessage("enable_mob_wander", (client: Client) => {
      this.enableMobWanderBehavior();
      console.log(`🚶 Mob wander behavior enabled by ${client.sessionId}`);
    });
  }

  onJoin(client: Client, options: any) {
    console.log(`👤 Player ${client.sessionId} joined the game`);
    
    // Add player to game state
    const playerName = options.name || `Player-${client.sessionId.substring(0, 8)}`;
    const player = this.state.addPlayer(client.sessionId, playerName);
    
    // Create physics body for player
    if (player) {
      this.physicsManager.createPlayerBody(player);
    }
    
    // Send welcome message
    client.send("welcome", {
      message: `Welcome to ${this.state.mapId}!`,
      playerId: client.sessionId,
      mapId: this.state.mapId
    });
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`👋 Player ${client.sessionId} left the game`);
    
    // Remove physics body for player
    this.physicsManager.removeBody(client.sessionId);
    
    // Remove player from game state
    this.state.removePlayer(client.sessionId);
  }

  onDispose() {
    console.log(`🗑️ GameRoom disposed`);
    
    // Stop simulation
    this.stopSimulation();
    
    // Clean up physics manager
    this.physicsManager.destroy();
  }

  // Start the game simulation loop
  private startSimulation() {
    this.simulationInterval = setInterval(() => {
      try {
        // Apply continuous player input as forces before physics step
        this.state.players.forEach((player) => {
          const inputMagnitude = Math.hypot(player.inputX, player.inputY);
          const playerBody = this.physicsManager.getBody(player.id);
          
          if (playerBody) {
            const currentVel = playerBody.getLinearVelocity();
            const mass = playerBody.getMass();
            let forceX = 0, forceY = 0;
            
            if (inputMagnitude > 0) {
              // Player is pressing keys - apply movement force
              const maxSpeed = 20; // units per second
              const acceleration = 15; // units per second squared
              
              // Target velocity (capped at max speed)
              const targetVx = (player.inputX / inputMagnitude) * maxSpeed;
              const targetVy = (player.inputY / inputMagnitude) * maxSpeed;
              
              // Calculate force needed: F = m * a
              forceX = mass * acceleration * (targetVx - currentVel.x);
              forceY = mass * acceleration * (targetVy - currentVel.y);
            } else {
              // No input - apply friction force against current velocity
              // Get friction based on player position
              const frictionCoefficient = MAP_CONFIG.getFrictionAtPosition(player.x, player.y);
              forceX = -currentVel.x * mass * frictionCoefficient;
              forceY = -currentVel.y * mass * frictionCoefficient;
            }
            
            this.physicsManager.applyForceToBody(player.id, { x: forceX, y: forceY });
          }
        });

        // Update physics simulation
        this.physicsManager.update(GAME_CONFIG.tickRate);
        
        // Update entities from physics bodies
        this.updateEntitiesFromPhysics();
        
        // Update mobs with physics collision detection
        this.state.updateMobs(this.physicsManager);
        
        // Log simulation health every 1000 ticks
        if (this.state.tick % 1000 === 0) {
          console.log(`🔄 SIMULATION HEALTH: tick=${this.state.tick}, mobs=${this.state.mobs.size}, players=${this.state.players.size}`);
        }
      } catch (error) {
        console.error(`❌ SIMULATION ERROR:`, error);
        // Don't stop the simulation on error, just log it
      }
    }, GAME_CONFIG.tickRate);
  }

  // Stop the game simulation loop
  private stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = undefined;
    }
  }

  // Initialize physics bodies for existing entities
  private initializePhysicsBodies() {
    // Create physics bodies for mobs (collision detection only)
    this.state.mobs.forEach((mob) => {
      const body = this.physicsManager.createMobBody(mob);
      // Initialize mob mass from physics body immediately
      mob.mass = body.getMass();
    });
  }

  // Update entities from physics bodies
  private updateEntitiesFromPhysics() {
    // Update players from physics
    this.state.players.forEach((player) => {
      this.physicsManager.updateEntityFromBody(player, player.id);
    });

    // Mobs don't use physics - they use traditional movement
  }

  // Apply force to player
  applyForceToPlayer(sessionId: string, forceX: number, forceY: number) {
    this.physicsManager.applyForceToBody(sessionId, { x: forceX, y: forceY });
  }

  // Apply impulse to player
  applyImpulseToPlayer(sessionId: string, impulseX: number, impulseY: number) {
    this.physicsManager.applyImpulseToBody(sessionId, { x: impulseX, y: impulseY });
  }

  // Enable mob chase behavior
  enableMobChaseBehavior() {
    this.state.enableMobChaseBehavior();
  }

  // Enable mob wander behavior
  enableMobWanderBehavior() {
    this.state.enableMobWanderBehavior();
  }

  // Get room info for debugging
  getRoomInfo() {
    return {
      roomId: this.roomId,
      mapId: this.state.mapId,
      playerCount: this.state.players.size,
      mobCount: this.state.mobs.size,
      tick: this.state.tick,
      physicsBodies: this.physicsManager.getAllBodies().length
    };
  }

  // Set up collision callbacks for logging and debugging
  private setupCollisionCallbacks() {
    // Collision debug disabled by default
    
    let collisionCount = 0;
    
           // Mob-Mob collisions: Log only (let physics handle bouncing)
           this.physicsManager.onCollision('mob', 'mob', (bodyA, bodyB) => {
             // Get entity data from the physics manager
             const entityA = this.physicsManager.getEntityDataFromBody(bodyA);
             const entityB = this.physicsManager.getEntityDataFromBody(bodyB);
             
             if (entityA && entityB) {
               collisionCount++;
               // Only log every 10th collision to reduce spam
              // if (collisionCount % 50 === 0) console.log(`🔥 COLLISION #${collisionCount}: ${entityA.id} hit ${entityB.id}`);
               // Let physics engine handle the bouncing automatically
             } else {
               console.log(`❌ COLLISION CALLBACK: Missing entity data A=${!!entityA}, B=${!!entityB}`);
             }
           });

           // Player-Mob collisions: Log collision (both directions)
           this.physicsManager.onCollision('player', 'mob', (bodyA, bodyB) => {
             const entityA = this.physicsManager.getEntityDataFromBody(bodyA);
             const entityB = this.physicsManager.getEntityDataFromBody(bodyB);
      
      // if (entityA && entityB) console.log(`🎯 PLAYER COLLISION: ${entityA.id} hit ${entityB.id}`);
    });

           // Mob-Player collisions: Same callback (reverse order)
           this.physicsManager.onCollision('mob', 'player', (bodyA, bodyB) => {
             const entityA = this.physicsManager.getEntityDataFromBody(bodyA);
             const entityB = this.physicsManager.getEntityDataFromBody(bodyB);
      
      // if (entityA && entityB) console.log(`🎯 PLAYER COLLISION: ${entityA.id} hit ${entityB.id}`);
    });

           // Mob-Boundary collisions: Log only (let physics handle bouncing)
           this.physicsManager.onCollision('mob', 'boundary', (bodyA, bodyB) => {
             const entityA = this.physicsManager.getEntityDataFromBody(bodyA);
             
            // if (entityA) console.log(`🚧 BOUNDARY COLLISION: ${entityA.id} hit boundary`);
           });

           // Boundary-Mob collisions: Same callback (reverse order)
           this.physicsManager.onCollision('boundary', 'mob', (bodyA, bodyB) => {
             const entityB = this.physicsManager.getEntityDataFromBody(bodyB);
             
            // if (entityB) console.log(`🚧 BOUNDARY COLLISION: ${entityB.id} hit boundary`);
           });
  }
}
