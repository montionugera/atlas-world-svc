import { EventEmitter } from 'events'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'

export enum RoomEventType {
  PLAYER_JOINED = 'player:joined',
  PLAYER_LEFT = 'player:left',
  MOB_SPAWNED = 'mob:spawned',
  MOB_REMOVED = 'mob:removed',
  BATTLE_ATTACK = 'battle:attack',
  BATTLE_HEAL = 'battle:heal',
  PHYSICS_IMPACT = 'physics:impact',
}

export interface PlayerJoinedData {
  player: Player
}

export interface PlayerLeftData {
  player: Player
}

export interface MobSpawnedData {
  mob: Mob
}

export interface MobRemovedData {
  mob: Mob
}

export interface BattleAttackData {
  actorId: string
  targetId: string
  damage: number
  range: number
  roomId: string
}

export interface BattleHealData {
  actorId: string
  targetId: string
  amount: number
  healType?: string
  roomId: string
}

export interface ImpactEffectData {
  area: {
    x: number
    y: number
    radius: number
  }
  forceIntensity: number // 0.5 (basic), 3 (large), 10 (epic)
  sourceId: string
  roomId: string
}

export type RoomEventData = PlayerJoinedData | PlayerLeftData | MobSpawnedData | MobRemovedData | BattleAttackData | BattleHealData | ImpactEffectData

export interface RoomEventPayload {
  eventType: RoomEventType
  roomId: string
  data: RoomEventData
  timestamp: number
}

export class EventBus extends EventEmitter {
  private static instance: EventBus | null = null

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus()
    }
    return EventBus.instance
  }

  public static reset(): void {
    EventBus.instance = null
  }

  /**
   * Emit a room-scoped event
   */
  public emitRoomEvent(roomId: string, eventType: RoomEventType, data: RoomEventData): void {
    const eventKey = `room-${roomId}:entity-event`
    const payload: RoomEventPayload = {
      eventType,
      roomId,
      data,
      timestamp: Date.now(),
    }

    console.log(`📡 EVENT: ${eventKey} -> ${eventType}`, { roomId, dataType: typeof data })
    this.emit(eventKey, payload)
  }

  /**
   * Listen to room-scoped events
   */
  public onRoomEvent(roomId: string, callback: (payload: RoomEventPayload) => void): void {
    const eventKey = `room-${roomId}:entity-event`
    this.on(eventKey, callback)
  }

  /**
   * Listen to player joined events
   */
  public onRoomEventPlayerJoin(roomId: string, callback: (data: PlayerJoinedData) => void): void {
    const eventKey = `room-${roomId}:entity-event`
    this.on(eventKey, (payload: RoomEventPayload) => {
      if (payload.eventType === RoomEventType.PLAYER_JOINED) {
        callback(payload.data as PlayerJoinedData)
      }
    })
  }

  /**
   * Listen to player left events
   */
  public onRoomEventPlayerLeft(roomId: string, callback: (data: PlayerLeftData) => void): void {
    const eventKey = `room-${roomId}:entity-event`
    this.on(eventKey, (payload: RoomEventPayload) => {
      if (payload.eventType === RoomEventType.PLAYER_LEFT) {
        callback(payload.data as PlayerLeftData)
      }
    })
  }

  /**
   * Listen to mob spawned events
   */
  public onRoomEventMobSpawn(roomId: string, callback: (data: MobSpawnedData) => void): void {
    const eventKey = `room-${roomId}:entity-event`
    this.on(eventKey, (payload: RoomEventPayload) => {
      if (payload.eventType === RoomEventType.MOB_SPAWNED) {
        callback(payload.data as MobSpawnedData)
      }
    })
  }

  /**
   * Listen to mob removed events
   */
  public onRoomEventMobRemove(roomId: string, callback: (data: MobRemovedData) => void): void {
    const eventKey = `room-${roomId}:entity-event`
    this.on(eventKey, (payload: RoomEventPayload) => {
      if (payload.eventType === RoomEventType.MOB_REMOVED) {
        callback(payload.data as MobRemovedData)
      }
    })
  }

  /**
   * Listen to battle attack events
   */
  public onRoomEventBattleAttack(roomId: string, callback: (data: BattleAttackData) => void): void {
    const eventKey = `room-${roomId}:entity-event`
    this.on(eventKey, (payload: RoomEventPayload) => {
      if (payload.eventType === RoomEventType.BATTLE_ATTACK) {
        callback(payload.data as BattleAttackData)
      }
    })
  }

  /**
   * Listen to battle heal events
   */
  public onRoomEventBattleHeal(roomId: string, callback: (data: BattleHealData) => void): void {
    const eventKey = `room-${roomId}:entity-event`
    this.on(eventKey, (payload: RoomEventPayload) => {
      if (payload.eventType === RoomEventType.BATTLE_HEAL) {
        callback(payload.data as BattleHealData)
      }
    })
  }

  /**
   * Listen to physics impact events
   */
  public onRoomEventPhysicsImpact(roomId: string, callback: (data: ImpactEffectData) => void): void {
    const eventKey = `room-${roomId}:entity-event`
    this.on(eventKey, (payload: RoomEventPayload) => {
      if (payload.eventType === RoomEventType.PHYSICS_IMPACT) {
        callback(payload.data as ImpactEffectData)
      }
    })
  }

  /**
   * Remove room event listener
   */
  public offRoomEvent(roomId: string, callback: (payload: RoomEventPayload) => void): void {
    const eventKey = `room-${roomId}:entity-event`
    this.off(eventKey, callback)
  }

  /**
   * Get all active listeners for debugging
   */
  public getActiveListeners(): string[] {
    return this.eventNames() as string[]
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance()
