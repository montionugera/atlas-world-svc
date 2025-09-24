import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import { Mob } from "./Mob";
import { Player } from "./Player";

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Mob }) mobs = new MapSchema<Mob>();
  @type("number") tick: number = 0;
  @type("string") mapId: string = "map-01-sector-a";
  @type("number") width: number = 800;
  @type("number") height: number = 600;

  constructor(mapId: string = "map-01-sector-a") {
    super();
    this.mapId = mapId;
    this.initializeMobs();
  }

  // Initialize mobs with random positions and velocities
  private initializeMobs() {
    this.mobs.clear();
    
    const mobCount = 8; // More mobs for better visibility
    for (let i = 1; i <= mobCount; i++) {
      const x = Math.random() * (this.width - 100) + 50; // Keep away from edges
      const y = Math.random() * (this.height - 100) + 50;
      const vx = (Math.random() - 0.5) * 4; // -2 to 2 (slower movement)
      const vy = (Math.random() - 0.5) * 4;
      
      const mobId = `mob-${i}`;
      this.mobs.set(mobId, new Mob(mobId, x, y, vx, vy));
    }
  }

  // Add a player to the game
  addPlayer(sessionId: string, name: string) {
    const player = new Player(sessionId, name);
    this.players.set(sessionId, player);
    return player;
  }

  // Remove a player from the game
  removePlayer(sessionId: string) {
    this.players.delete(sessionId);
  }

  // Get a player by session ID
  getPlayer(sessionId: string): Player | undefined {
    return this.players.get(sessionId);
  }

  // Update mob AI and physics
  updateMobs() {
    for (const mob of this.mobs.values()) {
      mob.updatePosition();
      mob.applyBoundaryPhysics(this.width, this.height);
    }
    this.tick++;
  }

  // Update player position
  updatePlayerPosition(sessionId: string, x: number, y: number) {
    const player = this.getPlayer(sessionId);
    if (player) {
      player.x = x;
      player.y = y;
    }
  }

  // Update player input (velocity)
  updatePlayerInput(sessionId: string, vx: number, vy: number) {
    const player = this.getPlayer(sessionId);
    if (player) {
      player.vx = vx;
      player.vy = vy;
    }
  }
}
