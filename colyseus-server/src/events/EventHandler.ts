import { eventBus, RoomEventType } from './EventBus'
// Removed global BattleManager singleton - now using room-scoped instances
import { PlanckPhysicsManager } from '../physics/PlanckPhysicsManager'

export class GameRoomEventHandler {
  private physicsManager: PlanckPhysicsManager
  private roomId: string

  constructor(physicsManager: PlanckPhysicsManager, roomId: string) {
    this.physicsManager = physicsManager
    this.roomId = roomId
    this.setupEventListeners()
  }

  /**
   * Set up event listeners for entity lifecycle events
   */
  private setupEventListeners(): void {
    // Player events
    eventBus.onRoomEventPlayerJoin(this.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Player joined ${data.player.sessionId}`)
      this.handlePlayerJoined(data.player)
    })

    eventBus.onRoomEventPlayerLeft(this.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Player left ${data.player.sessionId}`)
      this.handlePlayerLeft(data.player)
    })

    // Mob events
    eventBus.onRoomEventMobSpawn(this.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Mob spawned ${data.mob.id}`)
      this.handleMobSpawned(data.mob)
    })

    eventBus.onRoomEventMobRemove(this.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Mob removed ${data.mob.id}`)
      this.handleMobRemoved(data.mob)
    })
  }

  /**
   * Handle player joined event - setup physics and battle registration
   */
  private handlePlayerJoined(player: any): void {
    console.log(
      `👤 PLAYER JOINED: ${player.sessionId} - Setting up physics and battle registration`
    )

    // Create physics body for player
    this.physicsManager.createPlayerBody(player)

    // Register with battle manager
    // BattleManager registration now handled by GameRoom

    console.log(`✅ PLAYER SETUP COMPLETE: ${player.sessionId}`)
  }

  /**
   * Handle player left event - cleanup physics and battle registration
   */
  private handlePlayerLeft(player: any): void {
    console.log(`👤 PLAYER LEFT: ${player.sessionId} - Cleaning up physics and battle registration`)

    // Remove physics body
    this.physicsManager.removeBody(player.id)

    // Unregister from battle manager
    // BattleManager unregistration now handled by GameRoom

    console.log(`✅ PLAYER CLEANUP COMPLETE: ${player.sessionId}`)
  }

  /**
   * Handle mob spawned event - setup physics and battle registration
   */
  private handleMobSpawned(mob: any): void {
    console.log(`👹 MOB SPAWNED: ${mob.id} - Setting up physics and battle registration`)

    // Create physics body for mob
    this.physicsManager.createMobBody(mob)

    // Register with battle manager
    // BattleManager registration now handled by GameRoom

    console.log(`✅ MOB SETUP COMPLETE: ${mob.id}`)
  }

  /**
   * Handle mob removed event - cleanup physics and battle registration
   */
  private handleMobRemoved(mob: any): void {
    console.log(`👹 MOB REMOVED: ${mob.id} - Cleaning up physics and battle registration`)

    // Remove physics body
    this.physicsManager.removeBody(mob.id)

    // Unregister from battle manager
    // BattleManager unregistration now handled by GameRoom

    console.log(`✅ MOB CLEANUP COMPLETE: ${mob.id}`)
  }
}
