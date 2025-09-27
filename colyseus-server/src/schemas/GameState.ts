import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import { Mob } from "./Mob";
import { Player } from "./Player";
import { GAME_CONFIG } from "../config/gameConfig";

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Mob }) mobs = new MapSchema<Mob>();
  @type("number") tick: number = 0;
  @type("string") mapId: string = "map-01-sector-a";
  @type("number") width: number = GAME_CONFIG.worldWidth;
  @type("number") height: number = GAME_CONFIG.worldHeight;

  constructor(mapId: string = "map-01-sector-a") {
    super();
    this.mapId = mapId;
    this.initializeMobs();
  }

  // Initialize mobs with random positions and velocities
  private initializeMobs() {
    this.mobs.clear();
    
    for (let i = 1; i <= GAME_CONFIG.mobCount; i++) {
      const x = Math.random() * (this.width - GAME_CONFIG.mobSpawnMargin * 2) + GAME_CONFIG.mobSpawnMargin;
      const y = Math.random() * (this.height - GAME_CONFIG.mobSpawnMargin * 2) + GAME_CONFIG.mobSpawnMargin;
      const vx = (Math.random() - 0.5) * GAME_CONFIG.mobSpeedRange;
      const vy = (Math.random() - 0.5) * GAME_CONFIG.mobSpeedRange;
      
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
