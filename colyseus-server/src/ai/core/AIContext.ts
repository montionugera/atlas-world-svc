/**
 * AI Context and Data Management
 * Provides context for AI decision making
 */

import { GameState } from '../../schemas/GameState';
import { Player } from '../../schemas/Player';
import { Mob } from '../../schemas/Mob';
import { AIState } from './AIState';

export interface AIContext {
  // Game state
  gameState: GameState;
  physicsManager?: any;
  // The mob this context is evaluating
  selfMob: Mob;
  
  // Perception data
  nearbyPlayers: Player[];
  nearbyMobs: Mob[];
  threats: any[];
  
  // Environment
  worldBounds: { width: number; height: number };
  
  // AI state
  currentState: AIState;
  lastPlayerPosition?: { x: number; y: number };
  
  // Memory
  memory: AIMemory;
}

export interface AIMemory {
  lastSeenPlayer?: { position: { x: number; y: number }; timestamp: number };
  knownThreats: Map<string, { position: { x: number; y: number }; timestamp: number }>;
  behaviorHistory: Array<{ behavior: string; timestamp: number; duration: number }>;
}

export class AIMemoryImpl implements AIMemory {
  lastSeenPlayer?: { position: { x: number; y: number }; timestamp: number };
  knownThreats: Map<string, { position: { x: number; y: number }; timestamp: number }> = new Map();
  behaviorHistory: Array<{ behavior: string; timestamp: number; duration: number }> = [];
  
  updatePlayerPosition(position: { x: number; y: number }): void {
    this.lastSeenPlayer = { position, timestamp: Date.now() };
  }
  
  addThreat(threatId: string, position: { x: number; y: number }): void {
    this.knownThreats.set(threatId, { position, timestamp: Date.now() });
  }
  
  recordBehavior(behavior: string, duration: number): void {
    this.behaviorHistory.push({
      behavior,
      timestamp: Date.now(),
      duration
    });
    
    // Keep only last 20 behavior changes
    if (this.behaviorHistory.length > 20) {
      this.behaviorHistory.shift();
    }
  }
  
  getRecentBehaviors(count: number = 5): Array<{ behavior: string; timestamp: number; duration: number }> {
    return this.behaviorHistory.slice(-count);
  }
  
  clearOldData(maxAge: number = 30000): void { // 30 seconds
    const now = Date.now();
    
    // Clear old threats
    for (const [threatId, threat] of this.knownThreats) {
      if (now - threat.timestamp > maxAge) {
        this.knownThreats.delete(threatId);
      }
    }
    
    // Clear old behavior history
    this.behaviorHistory = this.behaviorHistory.filter(
      entry => now - entry.timestamp <= maxAge
    );
  }
}
