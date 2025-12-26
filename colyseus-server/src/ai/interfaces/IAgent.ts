import { AttackStrategy } from '../strategies/AttackStrategy'

export interface IAgent {
  // Identity
  id: string
  tags?: string[]
  
  // Physics & Position
  x: number
  y: number
  radius: number
  
  // AI State
  currentBehavior: string
  behaviorLockedUntil: number
  currentAttackTarget: string
  currentChaseTarget: string
  
  // Wander State (managed by WanderBehavior)
  wanderTargetX?: number
  wanderTargetY?: number
  lastWanderTargetTime?: number
  
  // Movement
  maxMoveSpeed: number
  
  // Combat
  attackStrategies: AttackStrategy[]
  attackRange: number
  
  // Methods required by AI
  applyBehaviorDecision(decision: {
    behavior: string
    behaviorLockedUntil: number
    currentAttackTarget: string
    currentChaseTarget: string
  }): void
  
  canAttack(): boolean
  
  // Lifecycle
  isAlive: boolean
}
