/**
 * Agent Behavior Decision System
 * Simple behavior-based decision making for agents (mobs and players)
 */

import { IAgent } from '../interfaces/IAgent'
import { Player } from '../../schemas/Player'
import { BehaviorState } from './BehaviorState'

export type AgentEnvironment = {
  nearestPlayer?: Player | null
  distanceToNearestPlayer?: number
  nearestMob?: IAgent | null
  distanceToNearestMob?: number
  nearBoundary?: boolean
  worldBounds?: { width: number; height: number }
}

export interface BehaviorDecision {
  behavior: BehaviorState
  behaviorLockedUntil: number
  currentAttackTarget: string
  currentChaseTarget: string
  desiredVelocity?: { x: number; y: number }
}

export interface AgentBehavior {
  readonly name: string
  readonly priority: number
  canApply(agent: IAgent, env: AgentEnvironment): boolean
  getDecision(agent: IAgent, env: AgentEnvironment, now: number): BehaviorDecision
}

/**
 * Avoid Boundary Behavior
 * Highest priority - mobs avoid world boundaries
 */
export class AvoidBoundaryBehavior implements AgentBehavior {
  readonly name = 'avoidBoundary'
  readonly priority: number


  constructor(priority: number = 10) {
    this.priority = priority
  }

  canApply(agent: IAgent, env: AgentEnvironment): boolean {
    if (env.nearBoundary !== undefined) {
      return env.nearBoundary
    }

    // Calculate from position if not provided
    const boundaryBuffer = 5
    const worldWidth = env.worldBounds?.width ?? 400
    const worldHeight = env.worldBounds?.height ?? 300
    const effectiveThreshold = boundaryBuffer + agent.radius

    return (
      agent.x < effectiveThreshold ||
      agent.x > worldWidth - effectiveThreshold ||
      agent.y < effectiveThreshold ||
      agent.y > worldHeight - effectiveThreshold
    )
  }

  getDecision(agent: IAgent, env: AgentEnvironment, now: number): BehaviorDecision {
    const worldWidth = env.worldBounds?.width ?? 400
    const worldHeight = env.worldBounds?.height ?? 300
    const maxSpeed = agent.maxMoveSpeed
    
    // Calculate avoidance force
    let avoidX = 0
    let avoidY = 0
    const boundaryBuffer = 5
    const effectiveThreshold = boundaryBuffer + agent.radius

    if (agent.x < effectiveThreshold) avoidX += (effectiveThreshold - agent.x) / effectiveThreshold
    if (agent.x > worldWidth - effectiveThreshold) avoidX -= (agent.x - (worldWidth - effectiveThreshold)) / effectiveThreshold
    if (agent.y < effectiveThreshold) avoidY += (effectiveThreshold - agent.y) / effectiveThreshold
    if (agent.y > worldHeight - effectiveThreshold) avoidY -= (agent.y - (worldHeight - effectiveThreshold)) / effectiveThreshold

    const magnitude = Math.hypot(avoidX, avoidY)
    let velocity = { x: 0, y: 0 }
    
    if (magnitude > 0) {
      const speed = Math.min(maxSpeed)
      velocity = {
        x: (avoidX / magnitude) * speed,
        y: (avoidY / magnitude) * speed,
      }
    } else {
      // Move to center if stuck
      const centerX = worldWidth / 2
      const centerY = worldHeight / 2
      const dx = centerX - agent.x
      const dy = centerY - agent.y
      const dist = Math.hypot(dx, dy) || 1
      velocity = { x: (dx / dist) * maxSpeed, y: (dy / dist) * maxSpeed }
    }

    return {
      behavior: BehaviorState.AVOID_BOUNDARY,
      behaviorLockedUntil: now + 200, // Short lock time
      currentAttackTarget: '',
      currentChaseTarget: '',
      desiredVelocity: velocity
    }
  }
}

/**
 * Attack Behavior
 * Mob attacks when player is within attack range
 */
export class AttackBehavior implements AgentBehavior {
  readonly name = 'attack'
  readonly priority: number

  constructor(priority: number = 8) {
    this.priority = priority
  }

  canApply(agent: IAgent, env: AgentEnvironment): boolean {
    // Determine target based on agent type
    const isPlayer = agent.tags?.includes('player')
    const target = isPlayer ? env.nearestMob : env.nearestPlayer
    const distance = isPlayer ? (env.distanceToNearestMob ?? Infinity) : (env.distanceToNearestPlayer ?? Infinity)

    if (distance === Infinity || !target) return false

    // Don't attack dead targets
    if (!target.isAlive) return false

    // Determine effective attack range from actual strategies
    const targetRadius = target.radius ?? 4
    
    if (agent.attackStrategies.length === 0) {
      // Fallback: use agent.attackRange if no strategies
      const effectiveAttackRange = agent.attackRange + agent.radius + targetRadius
      return distance <= effectiveAttackRange
    }

    // Calculate max range from all strategies
    let maxEffectiveRange = 0
    
    for (const strategy of agent.attackStrategies) {
      let strategyRange: number
      
      if (strategy.name === 'melee') {
        // Melee: add radii for collision-based range
        strategyRange = agent.attackRange + agent.radius + targetRadius
      } else if (strategy.name === 'spearThrow' && (strategy as any).maxRange) {
        // Ranged attack: use maxRange directly
        strategyRange = (strategy as any).maxRange
      } else {
        // Unknown strategy: fallback to agent.attackRange
        strategyRange = agent.attackRange + agent.radius + targetRadius
      }
      
      maxEffectiveRange = Math.max(maxEffectiveRange, strategyRange)
    }

    // Switch to attack behavior when in range
    // Cooldown is checked during attack execution, not here
    return distance <= maxEffectiveRange
  }

  getDecision(agent: IAgent, env: AgentEnvironment, now: number): BehaviorDecision {
    const isPlayer = agent.tags?.includes('player')
    const target = isPlayer ? env.nearestMob : env.nearestPlayer
    let velocity = { x: 0, y: 0 }
    
    if (target) {
      const distance = (isPlayer ? env.distanceToNearestMob : env.distanceToNearestPlayer) ?? Math.hypot(target.x - agent.x, target.y - agent.y)
      const targetRadius = target.radius || 4
      
      // Calculate preferred range (80% of max range)
      // Ideally we should check which strategy is active, but for movement we can be generic
      // Use melee range as baseline if no strategies, or max range of available strategies
      let maxRange = agent.attackRange + agent.radius + targetRadius
      
      if (agent.attackStrategies.length > 0) {
        // Find max range
        for (const s of agent.attackStrategies) {
           let r = agent.attackRange
           if (s.name === 'melee') r = agent.attackRange + agent.radius + targetRadius
           else if ((s as any).maxRange) r = (s as any).maxRange
           maxRange = Math.max(maxRange, r)
        }
      }
      
      const preferredRange = maxRange * 0.8
      
      if (distance > preferredRange) {
        // Move closer
        const dx = target.x - agent.x
        const dy = target.y - agent.y
        const dist = Math.hypot(dx, dy) || 1
        const speed = Math.min(agent.maxMoveSpeed * 0.6, agent.maxMoveSpeed)
        velocity = { x: (dx / dist) * speed, y: (dy / dist) * speed }
      }
    }

    return {
      behavior: BehaviorState.ATTACK,
      behaviorLockedUntil: now + 500, // 0.5 second lock
      currentAttackTarget: target?.id || '',
      currentChaseTarget: '',
      desiredVelocity: velocity
    }
  }
}

/**
 * Chase Behavior
 * Mob chases player when within chase range
 */
export class ChaseBehavior implements AgentBehavior {
  readonly name = 'chase'
  readonly priority: number
  private readonly chaseRange: number

  constructor(priority: number = 5, chaseRange: number = 25) {
    this.priority = priority
    this.chaseRange = chaseRange
  }

  canApply(agent: IAgent, env: AgentEnvironment): boolean {
    const isPlayer = agent.tags?.includes('player')
    const target = isPlayer ? env.nearestMob : env.nearestPlayer
    const distance = isPlayer ? (env.distanceToNearestMob ?? Infinity) : (env.distanceToNearestPlayer ?? Infinity)

    if (distance === Infinity || !target) return false
    
    // Don't chase dead targets
    if (!target.isAlive) return false
    
    return distance <= this.chaseRange
  }

  getDecision(agent: IAgent, env: AgentEnvironment, now: number): BehaviorDecision {
    const isPlayer = agent.tags?.includes('player')
    const target = isPlayer ? env.nearestMob : env.nearestPlayer
    let velocity = { x: 0, y: 0 }
    
    if (target) {
      const dx = target.x - agent.x
      const dy = target.y - agent.y
      const rawDistance = Math.hypot(dx, dy) || 1
      const effectiveDistance = rawDistance - agent.radius - (target.radius || 0)
      
      // Stopping distance logic
      const maxStoppingSpeed = 3
      let speed = agent.maxMoveSpeed
      
      if (effectiveDistance <= 3) {
        speed = Math.min(maxStoppingSpeed, speed)
      }
      
      velocity = { x: (dx / rawDistance) * speed, y: (dy / rawDistance) * speed }
    }

    return {
      behavior: BehaviorState.CHASE,
      behaviorLockedUntil: now, // No lock
      currentAttackTarget: '',
      currentChaseTarget: target?.id || '',
      desiredVelocity: velocity
    }
  }
}

/**
 * Wander Behavior
 * Default behavior when nothing else applies
 */
export class WanderBehavior implements AgentBehavior {
  readonly name = 'wander'
  readonly priority: number

  constructor(priority: number = 1) {
    this.priority = priority
  }

  canApply(agent: IAgent, env: AgentEnvironment): boolean {
    // Always applicable as fallback
    return true
  }

  getDecision(agent: IAgent, env: AgentEnvironment, now: number): BehaviorDecision {
    const wanderCooldown = 8000 // 8 seconds
    
    // Check if we need a new wander target
    // We access state on the agent directly (added to IAgent interface)
    let targetX = agent.wanderTargetX ?? agent.x
    let targetY = agent.wanderTargetY ?? agent.y
    const lastTime = agent.lastWanderTargetTime ?? 0
    
    if (now - lastTime > wanderCooldown || Math.hypot(targetX - agent.x, targetY - agent.y) < 5) {
      // Generate new target
      const wanderDistance = 200
      const wanderJitter = 50
      const boundaryBuffer = 20
      const boundaryThreshold = boundaryBuffer + agent.radius + 5
      
      const angle = Math.random() * Math.PI * 2
      const distance = wanderDistance + Math.random() * wanderJitter
      
      let tx = agent.x + Math.cos(angle) * distance
      let ty = agent.y + Math.sin(angle) * distance
      
      const worldWidth = env.worldBounds?.width ?? 2000
      const worldHeight = env.worldBounds?.height ?? 2000
      
      targetX = Math.max(boundaryThreshold, Math.min(worldWidth - boundaryThreshold, tx))
      targetY = Math.max(boundaryThreshold, Math.min(worldHeight - boundaryThreshold, ty))
      
      // Update agent state (side effect, but necessary unless we return state update)
      // Ideally getDecision should be pure, but agent state is mutable here
      agent.wanderTargetX = targetX
      agent.wanderTargetY = targetY
      agent.lastWanderTargetTime = now
    }
    
    // Calculate velocity
    const dx = targetX - agent.x
    const dy = targetY - agent.y
    const dist = Math.hypot(dx, dy)
    let velocity = { x: 0, y: 0 }
    
    if (dist > 0.1) {
      const speed = Math.min(agent.maxMoveSpeed * 0.6, agent.maxMoveSpeed)
      velocity = { x: (dx / dist) * speed, y: (dy / dist) * speed }
    }

    return {
      behavior: BehaviorState.WANDER,
      currentAttackTarget: '',
      currentChaseTarget: '',
      behaviorLockedUntil: now,
      desiredVelocity: velocity
    }
  }
}

/**
 * Default behavior set for mobs
 */
export const DEFAULT_AGENT_BEHAVIORS: AgentBehavior[] = [
  new AvoidBoundaryBehavior(),
  new AttackBehavior(),
  new ChaseBehavior(),
  new WanderBehavior(),
]

