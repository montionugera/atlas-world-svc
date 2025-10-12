import { type } from "@colyseus/schema";
import { WorldLife } from "./WorldLife";
import { PlayerInput } from "./PlayerInput";

export class Player extends WorldLife {
  @type("string") sessionId: string;
  @type("string") name: string;
  
  // Input state (server-only, not synced to clients)
  input: PlayerInput = new PlayerInput();
  
  // Target position for heading calculation (based on input direction)
  targetX: number = 0;
  targetY: number = 0;

  constructor(sessionId: string, name: string, x: number = 200, y: number = 150) {
    super(
      sessionId, 
      x, 
      y, 
      0, 
      0, 
      ["player"],
      4,   // Player radius
      100, // Players have more health
      8,   // Players deal less damage
      3,   // Players have shorter attack range
      1000, // Players attack faster
      1,   // Players have low defense
      0,   // Players have no armor
      0.8  // Players are less dense than mobs
    );
    this.sessionId = sessionId;
    this.name = name;
  }

  // Update heading based on input direction (not physics velocity)
  updateHeadingFromInput(): void {
    const inputMagnitude = this.input.getMovementMagnitude();
    if (inputMagnitude > 0.01) {
      // Use input direction for heading
      const normalized = this.input.getNormalizedMovement();
      this.heading = Math.atan2(normalized.y, normalized.x);
    }
  }
}
