import { Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string;
  @type("string") sessionId: string;
  @type("number") x: number;
  @type("number") y: number;
  @type("number") vx: number;
  @type("number") vy: number;
  @type("string") name: string;
  
  // Physics properties
  @type("string") physicsBodyId: string = "";
  @type("number") angle: number = 0;
  @type("number") angularVelocity: number = 0;
  @type("boolean") isStatic: boolean = false;
  
  // Input vector (authoritative physics will apply force each tick)
  @type("number") inputX: number = 0;
  @type("number") inputY: number = 0;

  constructor(sessionId: string, name: string, x: number = 200, y: number = 150) {
    super();
    this.id = sessionId; // Use sessionId as player ID
    this.sessionId = sessionId;
    this.name = name;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }

  // Helper method to update position
  updatePosition() {
    this.x += this.vx;
    this.y += this.vy;
  }

  // Helper method to apply boundary physics
  applyBoundaryPhysics(width: number = 400, height: number = 300) {
    // Clamp to boundaries
    this.x = Math.max(0, Math.min(width, this.x));
    this.y = Math.max(0, Math.min(height, this.y));
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
