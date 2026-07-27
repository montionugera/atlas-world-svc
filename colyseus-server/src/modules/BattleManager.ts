/**
 * BattleManager - Simple battle event coordinator
 * Just handles battle events and processes action messages
 */

import { BattleModule } from './BattleModule'
import {
  BattleActionMessage,
  BattleActionQueue,
  AttackActionPayload,
  HealActionPayload,
  KillActionPayload,
  RespawnActionPayload,
  DamageActionPayload,
  ProjectileDetail,
} from './BattleActionMessage'
import { DEFAULT_ELEMENT, type Element } from '../config/combat/elements'
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
        console.log(
          `⚔️ BATTLE EVENT: Attack from ${data.actorId} to ${data.targetId} (${data.damage} damage)`
        )
      } else {
        console.log(`⚔️ BATTLE EVENT: Attack from ${data.actorId} (no target)`)
      }

      // No element here on purpose: BATTLE_ATTACK is only emitted by the
      // strategy-less Mob/NPC fallback (and by the player's animation-only
      // event), and neither has an AttackDefinition to read an element from.
      // Every element-carrying attack in the game is projectile-sourced and
      // reaches the queue through ProjectileCollisionResolver instead.
      const attackMessage = BattleManager.createAttackMessage({
        actorId: data.actorId,
        targetId: data.targetId || '', // Use empty string if no target
        damage: data.damage,
        range: data.range,
      })

      this.addActionMessage(attackMessage)
    }
    eventBus.onRoomEventBattleAttack(this.roomId, this.attackListener)

    // Listen for battle heal events
    this.healListener = (data: BattleHealData) => {
      console.log(
        `💚 BATTLE EVENT: Heal from ${data.actorId} to ${data.targetId} (${data.amount} heal)`
      )

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
  static createAttackMessage(opts: {
    actorId: string
    targetId: string
    damage: number
    range: number
    /** Attack element (World Wisdom / F-017). Defaults to neutral. */
    element?: Element
    direction?: { x: number; y: number }
    /** melee (default), projectile, … — drives the range/cooldown bypass in canAttack. */
    attackType?: string
    projectileDetail?: ProjectileDetail
  }): BattleActionMessage {
    const actionPayload: AttackActionPayload = {
      damage: opts.damage,
      range: opts.range,
      direction: opts.direction,
      attackType: opts.attackType ?? 'melee',
      element: opts.element ?? DEFAULT_ELEMENT,
      projectileDetail: opts.projectileDetail,
    }

    return {
      actorId: opts.actorId,
      actionKey: 'attack',
      actionPayload,
      targetId: opts.targetId,
      timestamp: Date.now(),
      priority: 1,
    }
  }

  static createHealMessage(
    actorId: string,
    targetId: string,
    amount: number,
    healType: string = 'natural'
  ): BattleActionMessage {
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

  static createKillMessage(
    actorId: string,
    targetId: string,
    reason?: string
  ): BattleActionMessage {
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

  static createRespawnMessage(
    actorId: string,
    targetId: string,
    x?: number,
    y?: number,
    health?: number
  ): BattleActionMessage {
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
