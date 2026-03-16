/**
 * AI World Interface
 * Communication bridge between AI module and game world
 */

import { GameState } from '../schemas/GameState'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { NPC } from '../schemas/NPC'
import { WorldLife } from '../schemas/WorldLife'
import { IAgent } from './interfaces/IAgent'
import { AIDecision } from './core/AIBehavior'

export interface WorldData {
  players: Player[]
  mobs: Mob[]
  npcs: NPC[]
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
      npcs: Array.from(this.gameState.npcs.values()),
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

    // Check npcs (treat as players for mob aggro)
    for (const npc of this.gameState.npcs.values()) {
      if (!npc.isAlive) continue
      if (excludeAgentId && npc.id === excludeAgentId) continue

      const distance = this.calculateDistance(position, npc)
      if (distance <= range) {
        // We push them to nearbyPlayers so mobs can target them like players
        nearbyPlayers.push(npc as any)
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

  /** Nearest alive entity with a different teamId (players, NPCs, mobs). Used for chase/attack targeting. */
  getNearestOppositeTeam(
    position: { x: number; y: number },
    myTeamId: string | undefined,
    excludeId?: string
  ): WorldLife | null {
    let nearest: WorldLife | null = null
    let nearestDist = Infinity

    const consider = (other: WorldLife) => {
      if (!other.isAlive) return
      if (excludeId && other.id === excludeId) return
      if (myTeamId && other.teamId && myTeamId === other.teamId) return
      const d = this.calculateDistance(position, other)
      if (d < nearestDist) {
        nearest = other
        nearestDist = d
      }
    }

    for (const p of this.gameState.players.values()) consider(p)
    for (const n of this.gameState.npcs.values()) consider(n)
    for (const m of this.gameState.mobs.values()) consider(m)

    return nearest
  }

  // Legacy: nearest player only (no NPCs). Prefer getNearestOppositeTeam for targeting.
  getNearestPlayerOnly(position: { x: number; y: number }, excludeId?: string): Player | null {
    let nearest: Player | null = null
    let nearestDist = Infinity
    for (const player of this.gameState.players.values()) {
      if (!player.isAlive) continue
      if (excludeId && player.id === excludeId) continue
      const d = this.calculateDistance(position, player)
      if (d < nearestDist) {
        nearest = player
        nearestDist = d
      }
    }
    return nearest
  }

  // Legacy: nearest player or NPC. Prefer getNearestOppositeTeam for targeting.
  getNearestPlayer(position: { x: number; y: number }, excludeId?: string): Player | null {
    let nearest = this.getNearestPlayerOnly(position, excludeId)
    let nearestDist = nearest ? this.calculateDistance(position, nearest) : Infinity
    for (const npc of this.gameState.npcs.values()) {
      if (!npc.isAlive) continue
      if (excludeId && npc.id === excludeId) continue
      const d = this.calculateDistance(position, npc)
      if (d < nearestDist) {
        nearest = npc as any
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
    ownerPlayer: Player | null
  } {
    const position = { x: agent.x, y: agent.y }
    const myTeamId = agent.teamId

    // Chase/attack target = nearest opposite team (player, NPC, or mob by teamId).
    const nearestEnemy = this.getNearestOppositeTeam(position, myTeamId, agent.id)
    const distanceEnemy = nearestEnemy ? this.calculateDistance(position, nearestEnemy) : Infinity
    const inRangeEnemy = distanceEnemy <= (perceptionRange ?? Infinity)

    const isPlayerOrNpc =
      nearestEnemy && (this.gameState.players.has(nearestEnemy.id) || this.gameState.npcs.has(nearestEnemy.id))
    const isMobEnemy = nearestEnemy && this.gameState.mobs.has(nearestEnemy.id)

    const nearestPlayer = inRangeEnemy && isPlayerOrNpc ? (nearestEnemy as Player) : null
    const distanceToNearestPlayer = nearestPlayer ? distanceEnemy : Infinity

    const nearestMobRaw =
      inRangeEnemy && isMobEnemy ? nearestEnemy : this.getNearestMob(position, agent.id)
    const distanceMobRaw = nearestMobRaw ? this.calculateDistance(position, nearestMobRaw) : Infinity
    const inRangeMob = distanceMobRaw <= (perceptionRange ?? Infinity)
    const nearestMob: IAgent | null = inRangeMob ? (nearestMobRaw as IAgent) : null
    const distanceToNearestMob = inRangeMob ? distanceMobRaw : Infinity

    const nearBoundary = this.isNearBoundary(position)
    
    // Check owner if agent is a npc
    let ownerPlayer = null
    if ('ownerId' in agent && agent.ownerId) {
      ownerPlayer = this.gameState.players.get((agent as any).ownerId) || null
    }
    
    return {
      nearestPlayer,
      distanceToNearestPlayer,
      nearestMob,
      distanceToNearestMob,
      nearBoundary,
      worldBounds: { width: this.gameState.width, height: this.gameState.height },
      ownerPlayer,
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
    
    // If not found, try npcs
    if (!agent) {
      agent = this.gameState.npcs.get(agentId)
    }
    
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
      
      // Update desire timestamp if available
      if ('decisionTimestamp' in agent) {
        (agent as any).decisionTimestamp = decision.timestamp;
      }
      
      // Apply desired velocity and behavior
      if ('desiredVx' in agent) {
        (agent as any).desiredVx = decision.velocity.x;
        (agent as any).desiredVy = decision.velocity.y;
      }
      
      if ('desiredBehavior' in agent) {
        (agent as any).desiredBehavior = decision.behavior;
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
