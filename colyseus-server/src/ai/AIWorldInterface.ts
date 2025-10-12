/**
 * AI World Interface
 * Communication bridge between AI module and game world
 */

import { GameState } from '../schemas/GameState';
import { Player } from '../schemas/Player';
import { Mob } from '../schemas/Mob';
import { AIDecision } from './core/AIBehavior';

export interface WorldData {
  players: Player[];
  mobs: Mob[];
  worldBounds: { width: number; height: number };
  physicsManager?: any;
}

export interface NearbyEntities {
  nearbyPlayers: Player[];
  nearbyMobs: Mob[];
}

export class AIWorldInterface {
  private gameState: GameState;
  private physicsManager?: any;
  private aiDecisions: Map<string, AIDecision> = new Map();
  private static readonly DEBUG = false;
  
  constructor(gameState: GameState) {
    this.gameState = gameState;
    if (AIWorldInterface.DEBUG) console.log(`🔗 AI World Interface created for game state`);
  }
  
  // Set physics manager reference
  setPhysicsManager(physicsManager: any): void {
    this.physicsManager = physicsManager;
    if (AIWorldInterface.DEBUG) console.log(`🔗 Physics manager connected to AI interface`);
  }
  
  // Get world data for AI
  getWorldData(): WorldData {
    return {
      players: Array.from(this.gameState.players.values()),
      mobs: Array.from(this.gameState.mobs.values()),
      worldBounds: {
        width: this.gameState.width,
        height: this.gameState.height
      },
      physicsManager: this.physicsManager
    };
  }
  
  // Get nearby entities for perception
  getNearbyEntities(mob: Mob, range: number): NearbyEntities {
    const nearbyPlayers: Player[] = [];
    const nearbyMobs: Mob[] = [];
    
    // Check players
    for (const player of this.gameState.players.values()) {
      const distance = this.calculateDistance(mob, player);
      if (distance <= range) {
        nearbyPlayers.push(player);
      }
    }
    
    // Check other mobs
    for (const otherMob of this.gameState.mobs.values()) {
      if (otherMob.id !== mob.id) {
        const distance = this.calculateDistance(mob, otherMob);
        if (distance <= range) {
          nearbyMobs.push(otherMob);
        }
      }
    }
    
    return { nearbyPlayers, nearbyMobs };
  }

  // Helper: get nearest player to a mob
  getNearestPlayer(mob: Mob): Player | null {
    let nearest: Player | null = null;
    let nearestDist = Infinity;
    for (const player of this.gameState.players.values()) {
      const d = this.calculateDistance(mob, player);
      if (d < nearestDist) {
        nearest = player;
        nearestDist = d;
      }
    }
    return nearest;
  }

  // Helper: is mob near world boundary
  isNearBoundary(mob: Mob, threshold: number = 5): boolean {
    const { width, height } = this.gameState;
    const left = mob.x;
    const right = width - mob.x;
    const top = mob.y;
    const bottom = height - mob.y;
    return left < threshold || right < threshold || top < threshold || bottom < threshold;
  }

  // Build a compact environment snapshot for a mob
  buildMobEnvironment(mob: Mob, perceptionRange: number): {
    nearestPlayer: Player | null;
    distanceToNearestPlayer: number;
    nearBoundary: boolean;
    worldBounds: { width: number; height: number };
  } {
    const nearestPlayerRaw = this.getNearestPlayer(mob);
    const distanceRaw = nearestPlayerRaw ? this.calculateDistance(mob, nearestPlayerRaw) : Infinity;
    const inRange = distanceRaw <= (perceptionRange ?? Infinity);
    const nearestPlayer = inRange ? nearestPlayerRaw : null;
    const distanceToNearestPlayer = inRange ? distanceRaw : Infinity;
    const nearBoundary = this.isNearBoundary(mob);
    return {
      nearestPlayer,
      distanceToNearestPlayer,
      nearBoundary,
      worldBounds: { width: this.gameState.width, height: this.gameState.height }
    };
  }
  
  // Apply AI decision to mob
  applyAIDecision(mobId: string, decision: AIDecision): void {
    this.aiDecisions.set(mobId, decision);
    const mob = this.gameState.mobs.get(mobId);
    if (mob) {
      mob.desiredVx = decision.velocity.x;
      mob.desiredVy = decision.velocity.y;
      mob.desiredBehavior = decision.behavior;
      mob.decisionTimestamp = decision.timestamp;
      // If no physics manager/body, reflect desired velocity directly to maintain legacy behavior
      if (!this.physicsManager || !this.physicsManager.getBody || !this.physicsManager.getBody(mobId)) {
        mob.vx = decision.velocity.x;
        mob.vy = decision.velocity.y;
      }
    }
  }
  
  // Sync no longer needed; GameState consumes decisions directly in physics step
  
  // Get AI decision for a mob
  getAIDecision(mobId: string): AIDecision | undefined {
    return this.aiDecisions.get(mobId);
  }
  
  // Clear AI decisions
  clearAIDecisions(): void {
    this.aiDecisions.clear();
  }
  
  // Get AI statistics
  getAIStats(): { decisionCount: number; activeMobs: number } {
    return {
      decisionCount: this.aiDecisions.size,
      activeMobs: this.gameState.mobs.size
    };
  }
  
  private calculateDistance(from: { x: number; y: number }, to: { x: number; y: number }): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
