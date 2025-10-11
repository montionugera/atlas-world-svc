import { Schema, type, ArraySchema } from "@colyseus/schema";

export abstract class WorldObject extends Schema {
  @type("string") id: string;
  @type("number") x: number;
  @type("number") y: number;
  @type("number") vx: number;
  @type("number") vy: number;
  @type(["string"]) tags: ArraySchema<string>;
  
  // Physics properties
  @type("string") physicsBodyId: string = "";
  @type("number") angle: number = 0;
  @type("number") angularVelocity: number = 0;
  @type("boolean") isStatic: boolean = false;

  constructor(id: string, x: number, y: number, vx: number = 0, vy: number = 0, defaultTags: string[] = []) {
    super();
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.tags = new ArraySchema<string>(...defaultTags);
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
