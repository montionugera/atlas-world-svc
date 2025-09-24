import { Room, Client } from "colyseus";
import { GameState } from "../schemas/GameState";
import { Player } from "../schemas/Player";

export class GameRoom extends Room<GameState> {
  // Room configuration
  maxClients = 20;

  // Simulation settings
  private simulationInterval?: NodeJS.Timeout;
  private readonly SIMULATION_RATE = 50; // 20 FPS (50ms)

  onCreate(options: any) {
    console.log(`🎮 GameRoom created with mapId: ${options.mapId || 'map-01-sector-a'}`);
    
    // Initialize game state
    this.setState(new GameState(options.mapId || 'map-01-sector-a'));

    // Start simulation loop
    this.startSimulation();

    // Handle player messages
    this.onMessage("player_input", (client: Client, data: { vx: number; vy: number }) => {
      const player = this.state.getPlayer(client.sessionId);
      if (player) {
        this.state.updatePlayerInput(client.sessionId, data.vx, data.vy);
      }
    });

    this.onMessage("player_position", (client: Client, data: { x: number; y: number }) => {
      const player = this.state.getPlayer(client.sessionId);
      if (player) {
        this.state.updatePlayerPosition(client.sessionId, data.x, data.y);
      }
    });
  }

  onJoin(client: Client, options: any) {
    console.log(`👤 Player ${client.sessionId} joined the game`);
    
    // Add player to game state
    const playerName = options.name || `Player-${client.sessionId.substring(0, 8)}`;
    this.state.addPlayer(client.sessionId, playerName);
    
    // Send welcome message
    client.send("welcome", {
      message: `Welcome to ${this.state.mapId}!`,
      playerId: client.sessionId,
      mapId: this.state.mapId
    });
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`👋 Player ${client.sessionId} left the game`);
    
    // Remove player from game state
    this.state.removePlayer(client.sessionId);
  }

  onDispose() {
    console.log(`🗑️ GameRoom disposed`);
    
    // Stop simulation
    this.stopSimulation();
  }

  // Start the game simulation loop
  private startSimulation() {
    this.simulationInterval = setInterval(() => {
      this.state.updateMobs();
      
      // Update player positions based on their velocity
      this.state.players.forEach((player) => {
        player.updatePosition();
        player.applyBoundaryPhysics(this.state.width, this.state.height);
      });
    }, this.SIMULATION_RATE);
  }

  // Stop the game simulation loop
  private stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = undefined;
    }
  }

  // Get room info for debugging
  getRoomInfo() {
    return {
      roomId: this.roomId,
      mapId: this.state.mapId,
      playerCount: this.state.players.size,
      mobCount: this.state.mobs.size,
      tick: this.state.tick
    };
  }
}
