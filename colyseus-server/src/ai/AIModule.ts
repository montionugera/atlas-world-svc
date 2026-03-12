/**
 * AI Module
 * Main AI module controller that runs independently
 */

import { AIWorldInterface } from './AIWorldInterface'
import { IAgent } from './interfaces/IAgent'
import { AIPerformanceMonitor, AIPerformanceMetrics, AIStats } from './AIPerformanceMonitor'
import {
  AgentBehavior,
  AgentEnvironment,
  BehaviorDecision,
  DEFAULT_AGENT_BEHAVIORS,
  AvoidBoundaryBehavior,
  AttackBehavior,
  ChaseBehavior,
  WanderBehavior,
} from './behaviors/AgentBehaviors'

import {
  NPCFollowBehavior,
  NPCAttackBehavior,
} from './behaviors/NPCBehaviors'

type AgentEnvironmentFromInterface = ReturnType<AIWorldInterface['buildAgentEnvironment']>

export interface AIConfig {
  behaviors?: string[]
  perception?: { range?: number; fov?: number }
  memory?: { duration?: number }
  aggression?: number
  behaviorPriorities?: {
    avoidBoundary?: number
    attack?: number
    chase?: number
    wander?: number
    npcFollow?: number
    npcAttack?: number
  }
}

// No delegate needed; AIModule orchestrates directly

export class AIModule {
  private worldInterface: AIWorldInterface
  private agents: Map<string, { agent: IAgent; config: AIConfig; lastUpdate: number }> = new Map()
  private isRunning = false
  private updateFrequency = 20 // 20 FPS
  private performanceMonitor: AIPerformanceMonitor
  private lastUpdateTime = 0
  private behaviors: AgentBehavior[] = DEFAULT_AGENT_BEHAVIORS

  constructor(worldInterface: AIWorldInterface) {
    this.worldInterface = worldInterface
    this.performanceMonitor = new AIPerformanceMonitor()

    console.log(`🧠 AI Module initialized`)
  }

  // Start AI module (optional - for backward compatibility)
  start(): void {
    this.isRunning = true
    console.log(`🧠 AI Module started (tick-driven)`)
  }

  // Stop AI module
  stop(): void {
    this.isRunning = false
    console.log(`🧠 AI Module stopped`)
  }

  // Register agent for AI processing
  registerAgent(agent: IAgent, aiConfig: AIConfig): void {
    if (!agent || !agent.id) return
    this.agents.set(agent.id, { agent, config: aiConfig, lastUpdate: 0 })
  }

  // Unregister agent
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId)
  }

  // Backwards compatibility wrapper
  registerMob(mob: any, aiConfig: AIConfig): void {
    this.registerAgent(mob, aiConfig)
  }
  
  unregisterMob(mobId: string): void {
    this.unregisterAgent(mobId)
  }

  // Update all agent AI (public method for tick-driven updates)
  update(): void {
    if (!this.isRunning) return
    const now = Date.now()
    const dt = now - this.lastUpdateTime
    const targetInterval = 1000 / this.updateFrequency // 50ms for 20 FPS

    // Only update if enough time has passed
    if (dt < targetInterval) return
    this.lastUpdateTime = now
    this.updateAIDecision()
  }

  // Update all agent AI (public method for testing)
  updateAll(): void {
    this.updateAIDecision()
  }

  // Calculate separation velocity to prevent agent clustering
  private calculateSeparation(agent: IAgent): { x: number; y: number } {
    let sepX = 0
    let sepY = 0
    let count = 0
    
    const minSeparationRadius = 0.1
    // Weight must be strong enough to keep mobs apart before physical collision kicks in.
    // 1.5x was too weak when multiple mobs cluster — 4x deflects without killing chase intent.
    const separationWeightBase = agent.maxMoveSpeed * 4.0

    for (const { agent: other } of this.agents.values()) {
      if (!other.isAlive || other.id === agent.id) continue

      // Only separate agents on the same team (optional, but good for reducing friendly clustering)
      // or optionally, all agents pushing each other
      if (agent.teamId && other.teamId && agent.teamId !== other.teamId) continue

      const dx = agent.x - other.x
      const dy = agent.y - other.y
      const distanceSq = dx * dx + dy * dy
      
      // Separation must start BEFORE physical overlap (padding > collision gap).
      // Padding = 15 gives mobs time to steer apart before Planck's restitution launches them.
      const separationRadius = (agent.radius || 4) + (other.radius || 4) + 15

      if (distanceSq > 0 && distanceSq < separationRadius * separationRadius) {
        const distance = Math.max(Math.sqrt(distanceSq), minSeparationRadius)
        
        // Repulsion is stronger the closer they are
        // We scale the strength additionally by how much they are overlapping into their separation threshold
        const strength = separationWeightBase * (1 - distance / separationRadius)
        
        // Normalize the direction vector and scale by strength
        sepX += (dx / distance) * strength
        sepY += (dy / distance) * strength
        count++
      }
    }

    if (count > 0) {
      sepX /= count
      sepY /= count
    }

    return { x: sepX, y: sepY }
  }

  // Internal AI update logic
  private updateAIDecision(): void {
    const startTime = performance.now()

    try {
      // Update all agent AI (inline engine logic)
      for (const { agent, config } of this.agents.values()) {
        // Skip dead agents - lifecycle manager will remove them
        if (!agent.isAlive) continue

        const env: AgentEnvironmentFromInterface = this.worldInterface.buildAgentEnvironment(
          agent,
          config?.perception?.range ?? 50
        )
        
        // AI module decides behavior (not Agent)
        const behaviorDecision = this.decideBehavior(agent, env)
        
        // Agent applies the behavior decision (state transition)
        agent.applyBehaviorDecision(behaviorDecision)
        
        // Use desired velocity from decision (or zero if not provided)
        let desired = behaviorDecision.desiredVelocity || { x: 0, y: 0 }
        
        // --- CASTING OVERRIDE ---
        // If the agent is casting, the AI MUST NOT output a movement velocity, 
        // to prevent overriding the animation lock down the pipeline.
        if (agent.isCasting) {
          desired = { x: 0, y: 0 }
        }
        
        // --- SEPARATION STEERING ---
        // Apply separation as long as they aren't completely animation locked casting an ability
        if (!agent.isCasting) {
           const separation = this.calculateSeparation(agent)
           desired.x += separation.x
           desired.y += separation.y
           
           // Cap the combined sequence to the maximum move speed to prevent crazy speeds
           const speedSq = desired.x * desired.x + desired.y * desired.y
           const maxSpeed = agent.maxMoveSpeed
           if (speedSq > maxSpeed * maxSpeed && speedSq > 0.001) {
             const speed = Math.sqrt(speedSq)
             desired.x = (desired.x / speed) * maxSpeed
             desired.y = (desired.y / speed) * maxSpeed
           }
        }
        
        // Apply decision to world - but respect agent's behavior decision
        this.worldInterface.applyAIDecision(agent.id, {
          velocity: desired,
          behavior: agent.currentBehavior,
          timestamp: Date.now(),
        })
      }

      // Decisions are consumed by GameState.updateMobs via physics step

      // Record performance
      const updateTime = performance.now() - startTime
      this.performanceMonitor.recordUpdate(updateTime)

      // Log performance occasionally
      if (Math.random() < 0.01) {
        // 1% chance
        const stats = this.getStats()
        console.log(
          `⚡ AI Module: ${updateTime.toFixed(2)}ms, ${stats.agentCount} agents, avg: ${stats.averageUpdateTime.toFixed(2)}ms`
        )
      }
    } catch (error) {
      console.error(`❌ AI Module Error:`, error)
    }
  }

  // Get AI statistics
  getStats(): AIStats & { agentCount: number } {
    const metrics = this.performanceMonitor.getMetrics()
    return {
      agentCount: this.agents.size,
      mobCount: this.agents.size, // Backwards compatibility
      averageUpdateTime: metrics.averageUpdateTime,
      behaviorDistribution: this.getBehaviorDistribution(),
      memoryUsage: this.getMemoryUsageEstimate(),
    }
  }

  private getBehaviorDistribution(): { [behaviorName: string]: number } {
    const distribution: { [behaviorName: string]: number } = {}
    for (const { agent } of this.agents.values()) {
      const key = agent.currentBehavior || 'unknown'
      distribution[key] = (distribution[key] || 0) + 1
    }
    return distribution
  }

  // Rough estimate using decision history length if available in future; fallback to agent count
  private getMemoryUsageEstimate(): number {
    // No explicit memory tracking now; return proportional to agent count
    return this.agents.size * 0.1
  }

  // Configure update frequency
  setUpdateFrequency(fps: number): void {
    this.updateFrequency = fps
    if (this.isRunning) {
      this.stop()
      this.start()
    }
    console.log(`🧠 AI Module frequency set to ${fps} FPS`)
  }

  // Get performance metrics
  getPerformanceMetrics(): AIPerformanceMetrics {
    const m = this.performanceMonitor.getMetrics()
    return { ...m, isRunning: this.isRunning }
  }

  // Check if AI module is running
  isAIModuleRunning(): boolean {
    return this.isRunning
  }

  /**
   * AI Decision Logic: Decide what behavior an agent should have
   * Uses behavior-based system: filter applicable behaviors, sort by priority, return first
   * This is the AI module's responsibility - Agent just holds state
   * Public for testing and external use
   */
  decideBehavior(agent: IAgent, env: AgentEnvironmentFromInterface): BehaviorDecision {
    const now = performance.now()

    // Simple cooldown to prevent rapid switching
    if (agent.behaviorLockedUntil && now < agent.behaviorLockedUntil) {
      return {
        behavior: agent.currentBehavior,
        behaviorLockedUntil: agent.behaviorLockedUntil,
        currentAttackTarget: agent.currentAttackTarget,
        currentChaseTarget: agent.currentChaseTarget,
      }
    }

    // Get agent-specific behaviors (with custom priorities if configured)
    const agentData = this.agents.get(agent.id)
    const behaviors = agentData?.config?.behaviorPriorities
      ? this.getBehaviorsWithPriorities(agentData.config.behaviorPriorities)
      : this.behaviors

    // Convert to AgentEnvironment format
    const agentEnv: AgentEnvironment = {
      nearestPlayer: env.nearestPlayer || null,
      distanceToNearestPlayer: env.distanceToNearestPlayer,
      nearestMob: env.nearestMob || null,
      distanceToNearestMob: env.distanceToNearestMob,
      nearBoundary: env.nearBoundary,
      worldBounds: env.worldBounds,
      ownerPlayer: (env as any).ownerPlayer || null,
    }

    // Sort behaviors by priority (highest first)
    const sortedBehaviors = [...behaviors].sort((a, b) => b.priority - a.priority)

    // Filter to find applicable behaviors
    const applicableBehaviors = sortedBehaviors.filter((behavior) => behavior.canApply(agent, agentEnv))

    // Return decision from first applicable behavior (highest priority)
    if (applicableBehaviors.length > 0) {
      const selectedBehavior = applicableBehaviors[0]

      // Debug: Log behavior selection occasionally
      if (Math.random() < 0.01) {
        const distance = env.distanceToNearestPlayer ?? Infinity
        console.log(
          `🎯 AGENT ${agent.id}: selected behavior="${selectedBehavior.name}", distance=${distance.toFixed(2)}, priority=${selectedBehavior.priority}`
        )
      }

      return selectedBehavior.getDecision(agent, agentEnv, now)
    }

    // Fallback: should never happen (WanderBehavior always applies)
    return {
      behavior: 'wander',
      currentAttackTarget: '',
      currentChaseTarget: '',
      behaviorLockedUntil: now,
    }
  }

  // Get behaviors with custom priorities for a specific agent
  private getBehaviorsWithPriorities(priorities: {
    avoidBoundary?: number
    attack?: number
    chase?: number
    wander?: number
    npcFollow?: number
    npcAttack?: number
  }): AgentBehavior[] {
    const behaviors: AgentBehavior[] = [
      new AvoidBoundaryBehavior(priorities.avoidBoundary),
      new AttackBehavior(priorities.attack),
      new ChaseBehavior(priorities.chase),
      new WanderBehavior(priorities.wander),
    ]

    // Only add npc behaviors if they hold priority meaning they are configured
    if (priorities.npcFollow !== undefined) {
      behaviors.push(new NPCFollowBehavior(priorities.npcFollow))
    }
    if (priorities.npcAttack !== undefined) {
      behaviors.push(new NPCAttackBehavior(priorities.npcAttack))
    }

    return behaviors
  }
}

// Re-export types for convenience
export type { AIPerformanceMetrics, AIStats } from './AIPerformanceMonitor'
