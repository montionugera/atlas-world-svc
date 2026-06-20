// Server-only runtime fields that AI-driven entities (Mob, NPC) expose for steering.
// Lets WorldLife and AIWorldInterface access desired-velocity state without `as any`.
export interface IAgentRuntime {
  desiredVx: number
  desiredVy: number
  desiredBehavior?: string
  decisionTimestamp?: number
}
