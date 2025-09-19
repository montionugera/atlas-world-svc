// Atlas World Client - TypeScript client for mob simulation

import { Client } from '@heroiclabs/nakama-js';
import { 
  ClientConfig, 
  MatchState, 
  CreateMatchResponse, 
  JoinMatchResponse, 
  UpdatePositionResponse, 
  GetMatchStateResponse, 
  UpdateMobsResponse,
  Position,
  Mob
} from './types/game';

export class AtlasClient {
  private client: Client;
  private session: any = null;
  private matchId: string | null = null;
  private playerId: string;
  private isConnected: boolean = false;

  constructor(config: ClientConfig, playerId: string) {
    this.playerId = playerId;
    this.client = new Client(
      config.serverKey,
      config.serverHost,
      config.serverPort.toString(),
      config.useSSL
    );
  }

  async connect(): Promise<void> {
    try {
      console.log(`🔌 Connecting to Atlas World Server...`);
      
      // Authenticate with device ID
      this.session = await this.client.authenticateDevice(this.playerId, true);
      console.log(`✅ Authenticated as player: ${this.playerId}`);
      
      this.isConnected = true;
      console.log(`🎮 Connected to Atlas World Server!`);
    } catch (error) {
      console.error('❌ Connection failed:', error);
      throw error;
    }
  }

  async createMatch(): Promise<string> {
    if (!this.isConnected) {
      throw new Error('Client not connected. Call connect() first.');
    }

    try {
      console.log(`🎯 Creating new movement match...`);
      
      const result = await this.client.rpc(this.session, 'create_movement_match', {});
      const response: CreateMatchResponse = typeof result.payload === 'string' 
        ? JSON.parse(result.payload) 
        : result.payload as CreateMatchResponse;
      
      if (response.success && response.matchId) {
        this.matchId = response.matchId;
        console.log(`✅ Match created: ${this.matchId}`);
        return this.matchId;
      } else {
        throw new Error(`Failed to create match: ${response.error}`);
      }
    } catch (error) {
      console.error('❌ Failed to create match:', error);
      throw error;
    }
  }

  async joinMatch(matchId?: string): Promise<JoinMatchResponse> {
    if (!this.isConnected) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const targetMatchId = matchId || this.matchId;
    if (!targetMatchId) {
      throw new Error('No match ID provided and no active match.');
    }

    try {
      console.log(`🚪 Joining match: ${targetMatchId}`);
      
      const payload = { matchId: targetMatchId, playerId: this.playerId };
      const result = await this.client.rpc(this.session, 'join_match', payload);
      const response: JoinMatchResponse = typeof result.payload === 'string' 
        ? JSON.parse(result.payload) 
        : result.payload as JoinMatchResponse;
      
      if (response.success) {
        this.matchId = targetMatchId;
        console.log(`✅ Joined match: ${targetMatchId} (${response.playerCount} players)`);
      } else {
        throw new Error(`Failed to join match: ${response.error}`);
      }
      
      return response;
    } catch (error) {
      console.error('❌ Failed to join match:', error);
      throw error;
    }
  }

  async updatePlayerPosition(position: Position): Promise<UpdatePositionResponse> {
    if (!this.isConnected || !this.matchId) {
      throw new Error('Client not connected or no active match.');
    }

    try {
      const payload = {
        matchId: this.matchId,
        playerId: this.playerId,
        position: position
      };
      
      const result = await this.client.rpc(this.session, 'update_player_position', payload);
      const response: UpdatePositionResponse = typeof result.payload === 'string' 
        ? JSON.parse(result.payload) 
        : result.payload as UpdatePositionResponse;
      
      if (!response.success) {
        throw new Error(`Failed to update position: ${response.error}`);
      }
      
      return response;
    } catch (error) {
      console.error('❌ Failed to update player position:', error);
      throw error;
    }
  }

  async getMatchState(): Promise<GetMatchStateResponse> {
    if (!this.isConnected || !this.matchId) {
      throw new Error('Client not connected or no active match.');
    }

    try {
      const payload = { matchId: this.matchId };
      const result = await this.client.rpc(this.session, 'get_match_state', payload);
      const response: GetMatchStateResponse = typeof result.payload === 'string' 
        ? JSON.parse(result.payload) 
        : result.payload as GetMatchStateResponse;
      
      if (!response.success) {
        throw new Error(`Failed to get match state: ${response.error}`);
      }
      
      return response;
    } catch (error) {
      console.error('❌ Failed to get match state:', error);
      throw error;
    }
  }

  async updateMobs(): Promise<UpdateMobsResponse> {
    if (!this.isConnected || !this.matchId) {
      throw new Error('Client not connected or no active match.');
    }

    try {
      const payload = { matchId: this.matchId };
      const result = await this.client.rpc(this.session, 'update_mobs', payload);
      const response: UpdateMobsResponse = typeof result.payload === 'string' 
        ? JSON.parse(result.payload) 
        : result.payload as UpdateMobsResponse;
      
      if (!response.success) {
        throw new Error(`Failed to update mobs: ${response.error}`);
      }
      
      return response;
    } catch (error) {
      console.error('❌ Failed to update mobs:', error);
      throw error;
    }
  }

  // Mob simulation methods
  async simulateMobMovement(duration: number = 30000, interval: number = 1000): Promise<void> {
    if (!this.isConnected || !this.matchId) {
      throw new Error('Client not connected or no active match.');
    }

    console.log(`🤖 Starting mob simulation for ${duration/1000}s (updating every ${interval/1000}s)`);
    
    const startTime = Date.now();
    const endTime = startTime + duration;
    
    const simulationLoop = async (): Promise<void> => {
      if (Date.now() >= endTime) {
        console.log(`🏁 Mob simulation completed!`);
        return;
      }

      try {
        const response = await this.updateMobs();
        console.log(`🔄 Mob update - Tick: ${response.tick}, Mobs: ${response.mobs?.length || 0}`);
        
        if (response.mobs && response.mobs.length > 0) {
          response.mobs.forEach(mob => {
            console.log(`   🤖 ${mob.id}: pos(${mob.x}, ${mob.y}) vel(${mob.vx}, ${mob.vy})`);
          });
        }
        
        // Schedule next update
        setTimeout(simulationLoop, interval);
      } catch (error) {
        console.error('❌ Mob simulation error:', error);
        // Continue simulation despite errors
        setTimeout(simulationLoop, interval);
      }
    };

    // Start the simulation
    simulationLoop();
  }

  async simulatePlayerMovement(duration: number = 10000, interval: number = 500): Promise<void> {
    if (!this.isConnected || !this.matchId) {
      throw new Error('Client not connected or no active match.');
    }

    console.log(`🚶 Starting player movement simulation for ${duration/1000}s`);
    
    const startTime = Date.now();
    const endTime = startTime + duration;
    let step = 0;
    
    const movementLoop = async (): Promise<void> => {
      if (Date.now() >= endTime) {
        console.log(`🏁 Player movement simulation completed!`);
        return;
      }

      try {
        // Move in a square pattern
        const positions = [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 200 },
          { x: 100, y: 200 }
        ];
        
        const position = positions[step % positions.length];
        const response = await this.updatePlayerPosition(position);
        
        console.log(`🚶 Player moved to (${position.x}, ${position.y}) - Tick: ${response.tick}`);
        
        if (response.mobs && response.mobs.length > 0) {
          console.log(`   📍 Mobs updated: ${response.mobs.length} mobs`);
        }
        
        step++;
        
        // Schedule next movement
        setTimeout(movementLoop, interval);
      } catch (error) {
        console.error('❌ Player movement error:', error);
        // Continue movement despite errors
        setTimeout(movementLoop, interval);
      }
    };

    // Start the movement
    movementLoop();
  }

  async runFullSimulation(duration: number = 30000): Promise<void> {
    console.log(`🎮 Starting full Atlas World simulation for ${duration/1000}s`);
    
    // Start both mob and player simulations
    this.simulateMobMovement(duration, 1000);
    this.simulatePlayerMovement(duration, 2000);
  }

  getMatchId(): string | null {
    return this.matchId;
  }

  getPlayerId(): string {
    return this.playerId;
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }

  disconnect(): void {
    this.isConnected = false;
    this.matchId = null;
    console.log(`👋 Disconnected from Atlas World Server`);
  }
}
