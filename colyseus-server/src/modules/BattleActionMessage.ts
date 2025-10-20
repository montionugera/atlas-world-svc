/**
 * BattleActionMessage - Message system for battle communication
 * Allows entities to communicate with BattleModule through structured messages
 */

export interface BattleActionMessage {
  actorId: string // Who is performing the action (mob id, player id)
  actionKey: string // Type of action (attack, heal, kill, etc.)
  actionPayload: any // Action-specific data
  targetId?: string // Who is the target (player id, mob id)
  timestamp: number // When the action was created
  priority?: number // Action priority (higher = more important)
}

export interface AttackActionPayload {
  damage: number
  range: number
  direction?: { x: number; y: number }
  attackType?: string // melee, ranged, magic, etc.
}

export interface HealActionPayload {
  amount: number
  healType?: string // potion, spell, natural, etc.
}

export interface KillActionPayload {
  reason?: string
  killerId?: string
}

export interface RespawnActionPayload {
  x?: number
  y?: number
  health?: number
}

export interface DamageActionPayload {
  amount: number
  damageType?: string // physical, magical, poison, etc.
  source?: string
}


// Action message processor interface
export interface BattleActionProcessor {
  processAction(message: BattleActionMessage): Promise<boolean>
}

// Action message queue for managing message processing
export class BattleActionQueue {
  private messages: BattleActionMessage[] = []
  private maxQueueSize = 1000

  addMessage(message: BattleActionMessage): void {
    this.messages.push(message)

    // Sort by priority (higher priority first)
    this.messages.sort((a, b) => (b.priority || 0) - (a.priority || 0))

    // Keep queue size manageable
    if (this.messages.length > this.maxQueueSize) {
      this.messages = this.messages.slice(-this.maxQueueSize)
    }
  }

  getNextMessage(): BattleActionMessage | null {
    return this.messages.shift() || null
  }

  getAllMessages(): BattleActionMessage[] {
    return [...this.messages]
  }

  clearMessages(): void {
    this.messages = []
  }

  getQueueSize(): number {
    return this.messages.length
  }

  // Get messages for specific actor
  getMessagesForActor(actorId: string): BattleActionMessage[] {
    return this.messages.filter(msg => msg.actorId === actorId)
  }

  // Get messages for specific target
  getMessagesForTarget(targetId: string): BattleActionMessage[] {
    return this.messages.filter(msg => msg.targetId === targetId)
  }
}
