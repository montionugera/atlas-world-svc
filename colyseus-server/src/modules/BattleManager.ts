/**
 * BattleManager - Simple battle event coordinator
 * Just handles battle events and processes action messages
 */

import { BattleModule } from './BattleModule'
import { BattleActionMessage, BattleActionQueue, AttackActionPayload, HealActionPayload, KillActionPayload, RespawnActionPayload, DamageActionPayload } from './BattleActionMessage'
import { eventBus, RoomEventType, BattleAttackData, BattleHealData } from '../events/EventBus'
import { GameState } from '../schemas/GameState'

export class BattleManager {
  private battleModule: BattleModule
  private actionQueue: BattleActionQueue
  private roomId: string
  private attackListener: ((data: BattleAttackData) => void) | null = null
  private healListener: ((data: BattleHealData) => void) | null = null

  // Batch processing configuration
  private batchInterval = 100 // Reduced to 100ms per user request (was 200)
  private lastProcessTime = 0

  constructor(roomId: string, gameState: GameState) {
    this.roomId = roomId
    this.battleModule = new BattleModule(gameState)
    this.actionQueue = new BattleActionQueue()
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    // Listen for battle attack events
    this.attackListener = (data: BattleAttackData) => {
      if (data.targetId) {
        console.log(`⚔️ BATTLE EVENT: Attack from ${data.actorId} to ${data.targetId} (${data.damage} damage)`)
      } else {
        console.log(`⚔️ BATTLE EVENT: Attack from ${data.actorId} (no target)`)
      }
      
      const attackMessage = BattleManager.createAttackMessage(
        data.actorId,
        data.targetId || '', // Use empty string if no target
        data.damage,
        data.range
      )
      
      this.addActionMessage(attackMessage)
    }
    eventBus.onRoomEventBattleAttack(this.roomId, this.attackListener)

    // Listen for battle heal events
    this.healListener = (data: BattleHealData) => {
      console.log(`💚 BATTLE EVENT: Heal from ${data.actorId} to ${data.targetId} (${data.amount} heal)`)
      
      const healMessage = BattleManager.createHealMessage(
        data.actorId,
        data.targetId,
        data.amount,
        data.healType
      )
      
      this.addActionMessage(healMessage)
    }
    eventBus.onRoomEventBattleHeal(this.roomId, this.healListener)
  }

  /**
   * Clean up event listeners
   * Call this when BattleManager is no longer needed (e.g., in tests)
   */
  public cleanup(): void {
    if (this.attackListener) {
      eventBus.offRoomEvent(this.roomId, this.attackListener as any)
      this.attackListener = null
    }
    if (this.healListener) {
      eventBus.offRoomEvent(this.roomId, this.healListener as any)
      this.healListener = null
    }
  }

  // Static factory methods for creating action messages
  static createAttackMessage(actorId: string, targetId: string, damage: number, range: number, direction?: { x: number; y: number }): BattleActionMessage {
    return {
      actorId,
      actionKey: 'attack',
      actionPayload: {
        damage,
        range,
        direction,
        attackType: 'melee',
      } as AttackActionPayload,
      targetId,
      timestamp: Date.now(),
      priority: 1,
    }
  }

  static createHealMessage(actorId: string, targetId: string, amount: number, healType: string = 'natural'): BattleActionMessage {
    return {
      actorId,
      actionKey: 'heal',
      actionPayload: {
        amount,
        healType,
      } as HealActionPayload,
      targetId,
      timestamp: Date.now(),
      priority: 2,
    }
  }

  static createKillMessage(actorId: string, targetId: string, reason?: string): BattleActionMessage {
    return {
      actorId,
      actionKey: 'kill',
      actionPayload: {
        reason,
        killerId: actorId,
      } as KillActionPayload,
      targetId,
      timestamp: Date.now(),
      priority: 3,
    }
  }

  static createRespawnMessage(actorId: string, targetId: string, x?: number, y?: number, health?: number): BattleActionMessage {
    return {
      actorId,
      actionKey: 'respawn',
      actionPayload: {
        x,
        y,
        health,
      } as RespawnActionPayload,
      targetId,
      timestamp: Date.now(),
      priority: 2,
    }
  }

  // Add action message to queue
  addActionMessage(message: BattleActionMessage): void {
    this.actionQueue.addMessage(message)
  }

  // Process all pending action messages
  async processActionMessages(): Promise<number> {
    const now = Date.now()
    if (now - this.lastProcessTime < this.batchInterval) {
      return 0
    }
    this.lastProcessTime = now

    const messages = this.actionQueue.getAllMessages()
    if (messages.length === 0) return 0

    let processedCount = 0
    
    // Sort messages by priority (higher priority first)
    // 3: Kill, 2: Heal/Respawn, 1: Attack
    messages.sort((a, b) => (b.priority || 0) - (a.priority || 0))

    for (const message of messages) {
      try {
        const success = await this.battleModule.processAction(message)
        if (success) {
          processedCount++
        }
      } catch (error) {
        console.error(`❌ BATTLE PROCESSING ERROR:`, error)
      }
    }

    // Clear processed messages
    this.actionQueue.clearMessages()
    return processedCount
  }
}