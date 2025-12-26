/**
 * AI World Interface
 * Communication bridge between AI module and game world
 */

import { GameState } from '../schemas/GameState'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { IAgent } from './interfaces/IAgent'
import { AIDecision } from './core/AIBehavior'

export interface WorldData {
  players: Player[]
  mobs: Mob[]
  worldBounds: { width: number; height: number }
  physicsManager?: any
}

export interface NearbyEntities {
  nearbyPlayers: Player[]
  nearbyMobs: Mob[]
}

export class AIWorldInterface {
  private gameState: GameState
  private physicsManager?: any
  private aiDecisions: Map<string, AIDecision> = new Map()
  private static readonly DEBUG = false

  constructor(gameState: GameState) {
    this.gameState = gameState
    if (AIWorldInterface.DEBUG) console.log(`🔗 AI World Interface created for game state`)
  }

  // Set physics manager reference
  setPhysicsManager(physicsManager: any): void {
    this.physicsManager = physicsManager
    if (AIWorldInterface.DEBUG) console.log(`🔗 Physics manager connected to AI interface`)
  }

  // Get world data for AI
  getWorldData(): WorldData {
    return {
      players: Array.from(this.gameState.players.values()),
      mobs: Array.from(this.gameState.mobs.values()),
      worldBounds: {
        width: this.gameState.width,
        height: this.gameState.height,
      },
      physicsManager: this.physicsManager,
    }
  }

  // Get nearby entities for perception
  getNearbyEntities(
    position: { x: number; y: number },
    range: number,
    excludeAgentId?: string
  ): NearbyEntities {
    const nearbyPlayers: Player[] = []
    const nearbyMobs: Mob[] = []

    // Check players (only alive players)
    for (const player of this.gameState.players.values()) {
      if (!player.isAlive) continue
      if (excludeAgentId && player.id === excludeAgentId) continue

      const distance = this.calculateDistance(position, player)
      if (distance <= range) {
        nearbyPlayers.push(player)
      }
    }

    // Check other mobs (excluding the requesting mob if specified)
    for (const otherMob of this.gameState.mobs.values()) {
      if (!excludeAgentId || otherMob.id !== excludeAgentId) {
        const distance = this.calculateDistance(position, otherMob)
        if (distance <= range) {
          nearbyMobs.push(otherMob)
        }
      }
    }

    return { nearbyPlayers, nearbyMobs }
  }

  // Helper: get nearest player to a position (only alive players)
  getNearestPlayer(position: { x: number; y: number }, excludeId?: string): Player | null {
    let nearest: Player | null = null
    let nearestDist = Infinity
    for (const player of this.gameState.players.values()) {
      // Only consider alive players
      if (!player.isAlive) continue
      // Don't find self if agent is a player
      if (excludeId && player.id === excludeId) continue
      
      const d = this.calculateDistance(position, player)
      if (d < nearestDist) {
        nearest = player
        nearestDist = d
      }
    }
    return nearest
  }

  // Helper: get nearest mob to a position (only alive mobs)
  getNearestMob(position: { x: number; y: number }, excludeId?: string): IAgent | null {
    let nearest: IAgent | null = null
    let nearestDist = Infinity
    for (const mob of this.gameState.mobs.values()) {
      // Only consider alive mobs
      if (!mob.isAlive) continue
      // Don't find self if agent is a mob
      if (excludeId && mob.id === excludeId) continue
      
      const d = this.calculateDistance(position, mob)
      if (d < nearestDist) {
        nearest = mob
        nearestDist = d
      }
    }
    return nearest
  }

  // Helper: is position near world boundary
  isNearBoundary(position: { x: number; y: number }, threshold: number = 5): boolean {
    const { width, height } = this.gameState
    const left = position.x
    const right = width - position.x
    const top = position.y
    const bottom = height - position.y
    return left < threshold || right < threshold || top < threshold || bottom < threshold
  }

  // Build a compact environment snapshot for an agent
  buildAgentEnvironment(
    agent: IAgent,
    perceptionRange: number
  ): {
    nearestPlayer: Player | null
    distanceToNearestPlayer: number
    nearestMob: IAgent | null
    distanceToNearestMob: number
    nearBoundary: boolean
    worldBounds: { width: number; height: number }
  } {
    const position = { x: agent.x, y: agent.y }
    
    // Find nearest player
    const nearestPlayerRaw = this.getNearestPlayer(position, agent.id)
    const distancePlayerRaw = nearestPlayerRaw
      ? this.calculateDistance(position, nearestPlayerRaw)
      : Infinity
    const inRangePlayer = distancePlayerRaw <= (perceptionRange ?? Infinity)
    const nearestPlayer = inRangePlayer ? nearestPlayerRaw : null
    const distanceToNearestPlayer = inRangePlayer ? distancePlayerRaw : Infinity

    // Find nearest mob
    const nearestMobRaw = this.getNearestMob(position, agent.id)
    const distanceMobRaw = nearestMobRaw
      ? this.calculateDistance(position, nearestMobRaw)
      : Infinity
    const inRangeMob = distanceMobRaw <= (perceptionRange ?? Infinity)
    const nearestMob = inRangeMob ? nearestMobRaw : null
    const distanceToNearestMob = inRangeMob ? distanceMobRaw : Infinity

    const nearBoundary = this.isNearBoundary(position)
    return {
      nearestPlayer,
      distanceToNearestPlayer,
      nearestMob,
      distanceToNearestMob,
      nearBoundary,
      worldBounds: { width: this.gameState.width, height: this.gameState.height },
    }
  }

  // Backwards compatibility
  buildMobEnvironment(mob: Mob, perceptionRange: number) {
    return this.buildAgentEnvironment(mob, perceptionRange)
  }

  // Apply AI decision to agent
  applyAIDecision(agentId: string, decision: AIDecision): void {
    this.aiDecisions.set(agentId, decision)
    
    // Try to find agent in mobs first
    let agent: IAgent | undefined = this.gameState.mobs.get(agentId)
    
    // If not found, try players
    if (!agent) {
      const player = this.gameState.players.get(agentId)
      // Only control players if they are in bot mode
      if (player && (player as any).isBotMode) {
        agent = player as unknown as IAgent
      }
    }

    if (agent) {
      // Apply AI decision (including attack behavior - computeDesiredVelocity handles movement logic)
      // Attack behavior may move closer if outside melee range, or stop if within melee range
      // We need to cast to any to access desiredVx/Vy as they might not be on IAgent interface but are on implementations
      // Or we should add them to IAgent? For now, let's assume implementations have them.
      // Actually, IAgent doesn't specify how velocity is stored, but Mob has desiredVx/Vy.
      // Let's check if the agent has these properties.
      
      if ('desiredVx' in agent) {
        (agent as any).desiredVx = decision.velocity.x;
        (agent as any).desiredVy = decision.velocity.y;
      }
      
      if ('desiredBehavior' in agent) {
        (agent as any).desiredBehavior = decision.behavior;
      }
      
      if ('decisionTimestamp' in agent) {
        (agent as any).decisionTimestamp = decision.timestamp;
      }

      // If no physics manager/body, reflect desired velocity directly to maintain legacy behavior
      // This is mostly for mobs without physics bodies or simple movement
      if (
        !this.physicsManager ||
        !this.physicsManager.getBody ||
        !this.physicsManager.getBody(agentId)
      ) {
        if ('vx' in agent && 'vy' in agent) {
            // Type assertion to write to readonly properties if they are readonly in schema (they are not)
            (agent as any).vx = decision.velocity.x;
            (agent as any).vy = decision.velocity.y;
        }
      }
    }
  }

  // Sync no longer needed; GameState consumes decisions directly in physics step

  // Get AI decision for a mob
  getAIDecision(mobId: string): AIDecision | undefined {
    return this.aiDecisions.get(mobId)
  }

  // Clear AI decisions
  clearAIDecisions(): void {
    this.aiDecisions.clear()
  }

  // Get AI statistics
  getAIStats(): { decisionCount: number; activeMobs: number } {
    return {
      decisionCount: this.aiDecisions.size,
      activeMobs: this.gameState.mobs.size,
    }
  }

  private calculateDistance(from: { x: number; y: number }, to: { x: number; y: number }): number {
    const dx = to.x - from.x
    const dy = to.y - from.y
    return Math.sqrt(dx * dx + dy * dy)
  }
}
