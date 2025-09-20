import { Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string;
  @type("string") sessionId: string;
  @type("number") x: number;
  @type("number") y: number;
  @type("number") vx: number;
  @type("number") vy: number;
  @type("string") name: string;

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
}
