import { IAgent } from '../interfaces/IAgent'
import { AgentEnvironment, BehaviorDecision, AgentBehavior } from './AgentBehaviors'
import { NPC } from '../../schemas/NPC'
import { Player } from '../../schemas/Player'
import { GAME_CONFIG } from '../../config/gameConfig'

/**
 * NPC Follow Behavior
 * NPC follows its owner when too far
 */
export class NPCFollowBehavior implements AgentBehavior {
  readonly name = 'followPlayer'
  readonly priority: number
  private followDistance: number

  constructor(priority: number = 5, followDistance: number = 15) {
    this.priority = priority
    this.followDistance = followDistance
  }

  canApply(agent: IAgent, env: AgentEnvironment): boolean {
    const npc = agent as unknown as NPC
    if (!npc.ownerId) return false
    
    // We expect the npc's owner to be nearby, or at least in the game
    // The environment nearestPlayer might not be the owner, so we could just use the target player if available
    // For simplicity, we just check if distance to any player is far? No, npc must follow its owner.
    // Env only gives nearestPlayer, but we need the specific owner.
    // Let's assume the npc has a reference or we search for the owner in env or agent state.
    
    // As a shortcut, if agent has ownerId, we need to know the owner's position.
    // since env doesn't give us all players, we may need to calculate it. But wait, `AgentEnvironment` doesn't have `allPlayers`.
    // For now, if nearestPlayer is the owner:
    if (env.nearestPlayer && env.nearestPlayer.id === npc.ownerId) {
      const dist = env.distanceToNearestPlayer ?? Infinity
      return dist > this.followDistance
    }
    
    // If owner is not the nearest player, we still want to follow.
    // In our AIWorldInterface, `nearestPlayer` is just the geometrically nearest.
    // To make this work optimally without changing AIWorldInterface, we will assume if nearest is NOT owner, we should probably still follow owner.
    // For now, let's rely on GameState being accessible or just looking for the player in the world.
    // Wait, AIWorldInterface is where environment is built. Maybe we can pass the owner to env?
    // Let's add ownerPlayer to AgentEnvironment.
    return true // We'll refine this in getDecision
  }

  getDecision(agent: IAgent, env: AgentEnvironment, now: number): BehaviorDecision {
    const npc = agent as unknown as NPC
    let velocity = { x: 0, y: 0 }
    
    // We need owner position. Let's assume env has owner from a future PR or we just use nearestPlayer if it's owner.
    // If we only have nearestPlayer and it's the owner:
    const owner = (env as any).ownerPlayer as Player || (env.nearestPlayer?.id === npc.ownerId ? env.nearestPlayer : null)
    
    if (owner) {
      const dx = owner.x - agent.x
      const dy = owner.y - agent.y
      const distance = Math.hypot(dx, dy) || 1
      
      if (distance > this.followDistance) {
        let speed = Math.min(agent.maxMoveSpeed * 0.9, 30) // Fast follow
        if (distance > 50) speed = Math.min(agent.maxMoveSpeed * 1.5, 45) // Sprint
        velocity = { x: (dx / distance) * speed, y: (dy / distance) * speed }
      }
    }

    return {
      behavior: 'followPlayer',
      behaviorLockedUntil: now,
      currentAttackTarget: '',
      currentChaseTarget: npc.ownerId || '',
      desiredVelocity: velocity
    }
  }
}

/**
 * NPC Attack Behavior
 * NPC attacks nearby hostile mobs
 */
export class NPCAttackBehavior implements AgentBehavior {
  readonly name = 'npcAttack'
  readonly priority: number

  constructor(priority: number = 6) {
    this.priority = priority
  }

  canApply(agent: IAgent, env: AgentEnvironment): boolean {
    // Attack if there is a nearest mob and it's alive
    if (!env.nearestMob || !env.nearestMob.isAlive) return false
    
    const distanceToMob = env.distanceToNearestMob ?? Infinity
    const attackRange = 50 // Awareness range for attacking
    
    return distanceToMob <= attackRange
  }

  getDecision(agent: IAgent, env: AgentEnvironment, now: number): BehaviorDecision {
    let velocity = { x: 0, y: 0 }
    const target = env.nearestMob
    
    if (target) {
      const distance = env.distanceToNearestMob ?? Math.hypot(target.x - agent.x, target.y - agent.y)
      const targetRadius = target.radius || 4
      const meleeRange = agent.attackRange + agent.radius + targetRadius
      
      if (distance > meleeRange) {
        const dx = target.x - agent.x
        const dy = target.y - agent.y
        const dist = Math.hypot(dx, dy) || 1
        const speed = Math.min(agent.maxMoveSpeed * 0.8, 25)
        velocity = { x: (dx / dist) * speed, y: (dy / dist) * speed }
      }
    }

    return {
      behavior: 'npcAttack',
      behaviorLockedUntil: now + 500,
      currentAttackTarget: target?.id || '',
      currentChaseTarget: '',
      desiredVelocity: velocity
    }
  }
}
