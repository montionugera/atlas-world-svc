import { type } from "@colyseus/schema";
import { WorldObject } from "./WorldObject";
import { PlayerInput } from "./PlayerInput";

export class Player extends WorldObject {
  @type("string") sessionId: string;
  @type("string") name: string;
  
  // Input state (server-only, not synced to clients)
  input: PlayerInput = new PlayerInput();

  constructor(sessionId: string, name: string, x: number = 200, y: number = 150) {
    super(sessionId, x, y, 0, 0, ["player"]);
    this.sessionId = sessionId;
    this.name = name;
  }
}
