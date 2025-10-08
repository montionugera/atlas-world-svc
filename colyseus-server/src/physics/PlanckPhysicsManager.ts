import * as planck from 'planck';
import { PHYSICS_CONFIG } from '../config/physicsConfig';
import { Player } from '../schemas/Player';
import { Mob } from '../schemas/Mob';

export class PlanckPhysicsManager {
  private world: planck.World;
  private bodies: Map<string, planck.Body> = new Map();
  private entityDataByBody: Map<planck.Body, any> = new Map(); // Map physics body to entity data
  private collisionCallbacks: Map<string, (bodyA: planck.Body, bodyB: planck.Body) => void> = new Map();

  constructor() {
    const ENABLE_PHYSICS_DEBUG = false; // set true to debug physics logs
    // Create Planck world with NO gravity
    this.world = planck.World({
      gravity: planck.Vec2(0, 0) // Zero gravity for top-down game
    });

    // Set up collision detection
    this.setupCollisionEvents();
    
    // Create world boundaries
    this.createWorldBoundaries();
  }

  // Create world boundaries
  private createWorldBoundaries() {
    const { width, height, boundaryThickness } = PHYSICS_CONFIG.world;
    
    // Create boundary walls
    const walls = [
      // Top wall
      this.world.createBody({
        type: 'static',
        position: planck.Vec2(width / 2, -boundaryThickness / 2)
      }),
      
      // Bottom wall
      this.world.createBody({
        type: 'static',
        position: planck.Vec2(width / 2, height + boundaryThickness / 2)
      }),
      
      // Left wall
      this.world.createBody({
        type: 'static',
        position: planck.Vec2(-boundaryThickness / 2, height / 2)
      }),
      
      // Right wall
      this.world.createBody({
        type: 'static',
        position: planck.Vec2(width + boundaryThickness / 2, height / 2)
      })
    ];

    // Add fixtures and store entity data for each wall
    walls.forEach((wall, index) => {
      const wallName = `boundary-${index}`;
      
      // Add fixture
      wall.createFixture({
        shape: index < 2 ? 
          planck.Box(width / 2, boundaryThickness / 2) : // Top/Bottom walls
          planck.Box(boundaryThickness / 2, height / 2),  // Left/Right walls
        isSensor: false,
        restitution: 0.8 // Bounce off boundaries
      });

      // Store entity data
      this.entityDataByBody.set(wall, { type: 'boundary', id: wallName });
    });
  }

  // Set up collision event handlers
  private setupCollisionEvents() {
    this.world.on('begin-contact', (contact) => {
      const bodyA = contact.getFixtureA().getBody();
      const bodyB = contact.getFixtureB().getBody();
      this.handleCollision(bodyA, bodyB, 'start');
    });

    this.world.on('end-contact', (contact) => {
      const bodyA = contact.getFixtureA().getBody();
      const bodyB = contact.getFixtureB().getBody();
      this.handleCollision(bodyA, bodyB, 'end');
    });
  }

  // Handle collision between two bodies
  private handleCollision(bodyA: planck.Body, bodyB: planck.Body, eventType: 'start' | 'end') {
    const entityA = this.getEntityDataFromBody(bodyA);
    const entityB = this.getEntityDataFromBody(bodyB);

    if (!entityA || !entityB) {
      // if (ENABLE_PHYSICS_DEBUG) console.log(`❌ MISSING ENTITY DATA: A=${!!entityA}, B=${!!entityB}`);
      return;
    }

    // Debug collision detection disabled by default

    // Call registered collision callbacks
    const callbackKey = `${entityA.type}-${entityB.type}`;
    const callback = this.collisionCallbacks.get(callbackKey);
    
    if (callback) {
      callback(bodyA, bodyB);
    }
  }

  // Get entity data from physics body
  public getEntityDataFromBody(body: planck.Body): any {
    const entityData = this.entityDataByBody.get(body);
    // Only log when entity data is missing to reduce spam
    // Missing entity data debug disabled by default
    return entityData || null;
  }

  // Create physics body for player
  createPlayerBody(player: Player): planck.Body {
    // Player body creation debug disabled by default
    
    const body = this.world.createBody({
      type: 'dynamic',
      position: planck.Vec2(player.x, player.y),
      linearDamping: 0.1, // Light air resistance only
      angularDamping: 0.1
    });

    if (!body) {
      console.error(`❌ FAILED TO CREATE PLAYER BODY for ${player.id}`);
      throw new Error(`Failed to create physics body for player ${player.id}`);
    }

    // Player body creation debug disabled by default
    
    body.createFixture({
      shape: planck.Circle(PHYSICS_CONFIG.entities.player.radius),
      density: PHYSICS_CONFIG.entities.player.mass,
      friction: PHYSICS_CONFIG.entities.player.friction,
      restitution: PHYSICS_CONFIG.entities.player.restitution
    });

    // Store entity data in our map
    const entityData = { type: 'player', id: player.id };
    this.entityDataByBody.set(body, entityData);
    // Player entity store debug disabled by default

    this.bodies.set(player.id, body);
    return body;
  }

  // Create physics body for mob (collision detection only)
  createMobBody(mob: Mob): planck.Body {
    const body = this.world.createBody({
      type: 'dynamic', // Dynamic bodies for automatic collision response
      position: planck.Vec2(mob.x, mob.y),
      linearDamping: 0, // NO damping - maintain velocity
      angularDamping: 0
    });

    // Set initial velocity on the physics body
    body.setLinearVelocity(planck.Vec2(mob.vx, mob.vy));

         body.createFixture({
           shape: planck.Circle(mob.radius || PHYSICS_CONFIG.entities.mob.radius), // Use per-mob radius
           isSensor: false, // Enable collision response
           density: 1.0, // Normal density for physics
           friction: 0.1, // Lower friction for better bouncing
           restitution: 0.8 // Higher bounce for better collision response
         });

    // Store entity data in our map
    const entityData = { type: 'mob', id: mob.id };
    this.entityDataByBody.set(body, entityData);
    // Mob entity store debug disabled by default

    this.bodies.set(mob.id, body);
    // Initialize mob mass from the created body
    try {
      mob.mass = body.getMass();
    } catch {
      // ignore if mass not available yet
    }
    // Mob body creation debug disabled by default
    return body;
  }

  // Remove physics body
  removeBody(entityId: string) {
    const body = this.bodies.get(entityId);
    if (body) {
      this.entityDataByBody.delete(body);
      this.world.destroyBody(body);
      this.bodies.delete(entityId);
    }
  }

  // Get physics body
  getBody(entityId: string): planck.Body | undefined {
    return this.bodies.get(entityId);
  }

  // Update physics simulation
  update(deltaTime: number) {
    this.world.step(deltaTime / 1000); // Convert to seconds
    
    // Log physics update occasionally
    // Physics update debug disabled by default
  }

  // Update entity from physics body
  updateEntityFromBody(entity: any, entityId: string) {
    const body = this.bodies.get(entityId);
    if (body) {
      const position = body.getPosition();
      const velocity = body.getLinearVelocity();
      
      entity.x = position.x;
      entity.y = position.y;
      entity.vx = velocity.x;
      entity.vy = velocity.y;
      entity.angle = body.getAngle();
      entity.angularVelocity = body.getAngularVelocity();
    }
  }

  // Sync entity position to physics body
  syncEntityToBody(entity: any, entityId: string) {
    const body = this.bodies.get(entityId);
    if (body) {
      body.setPosition(planck.Vec2(entity.x, entity.y));
      body.setLinearVelocity(planck.Vec2(entity.vx, entity.vy));
    }
  }

  // Register collision callback
  onCollision(entityTypeA: string, entityTypeB: string, callback: (bodyA: planck.Body, bodyB: planck.Body) => void) {
    const key = `${entityTypeA}-${entityTypeB}`;
    this.collisionCallbacks.set(key, callback);
    // Collision callback registration debug disabled by default
    
    // Also register the reverse order for bidirectional collisions
    if (entityTypeA !== entityTypeB) {
      const reverseKey = `${entityTypeB}-${entityTypeA}`;
      this.collisionCallbacks.set(reverseKey, (bodyA, bodyB) => callback(bodyB, bodyA));
      // Collision callback registration debug disabled by default
    }
  }

  // Apply force to body
  applyForceToBody(entityId: string, force: { x: number, y: number }) {
    const body = this.bodies.get(entityId);
    if (body) {
      body.applyForce(planck.Vec2(force.x, force.y), body.getWorldCenter());
    }
  }

  // Apply impulse to body
  applyImpulseToBody(entityId: string, impulse: { x: number, y: number }) {
    const body = this.bodies.get(entityId);
    if (body) {
      body.applyLinearImpulse(planck.Vec2(impulse.x, impulse.y), body.getWorldCenter());
    }
  }

  // Get all bodies count
  getAllBodies() {
    return Array.from(this.bodies.values());
  }

  // Destroy physics manager
  destroy() {
    this.bodies.clear();
    this.entityDataByBody.clear();
    this.collisionCallbacks.clear();
  }
}
