import { type } from "@colyseus/schema";
import { WorldLife } from "./WorldLife";
import { PlayerInput } from "./PlayerInput";

export class Player extends WorldLife {
  @type("string") sessionId: string;
  @type("string") name: string;
  
  // Input state (server-only, not synced to clients)
  input: PlayerInput = new PlayerInput();

  constructor(sessionId: string, name: string, x: number = 200, y: number = 150) {
    super(
      sessionId, 
      x, 
      y, 
      0, 
      0, 
      ["player"],
      100, // Players have more health
      8,   // Players deal less damage
      3,   // Players have shorter attack range
      1000 // Players attack faster
    );
    this.sessionId = sessionId;
    this.name = name;
  }
}
