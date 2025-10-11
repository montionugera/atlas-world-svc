import { type } from "@colyseus/schema";
import { WorldObject } from "./WorldObject";

export class Player extends WorldObject {
  @type("string") sessionId: string;
  @type("string") name: string;
  
  // Input vector (authoritative physics will apply force each tick)
  @type("number") inputX: number = 0;
  @type("number") inputY: number = 0;

  constructor(sessionId: string, name: string, x: number = 200, y: number = 150) {
    super(sessionId, x, y, 0, 0, ["player"]);
    this.sessionId = sessionId;
    this.name = name;
  }
}
