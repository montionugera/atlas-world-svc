
/**
 * Defines the possible states for agent behaviors.
 * Using a constant object allows for type safety while keeping string values for serialization.
 */
export const BehaviorState = {
  IDLE: 'idle',
  WANDER: 'wander',
  CHASE: 'chase',
  ATTACK: 'attack',
  AVOID_BOUNDARY: 'avoidBoundary',
} as const

// Type definition derived from the constants
export type BehaviorState = typeof BehaviorState[keyof typeof BehaviorState] | string
