import { Schema, type } from "@colyseus/schema";

export class Mob extends Schema {
  @type("string") id: string;
  @type("number") x: number;
  @type("number") y: number;
  @type("number") vx: number;
  @type("number") vy: number;

  constructor(id: string, x: number, y: number, vx: number = 0, vy: number = 0) {
    super();
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }

  // Helper method to update position
  updatePosition() {
    this.x += this.vx;
    this.y += this.vy;
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
}
