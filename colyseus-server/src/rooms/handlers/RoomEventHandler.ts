import { GameRoom } from '../GameRoom'
import { eventBus } from '../../events/EventBus'
import { Player } from '../../schemas/Player'
import { Mob } from '../../schemas/Mob'

export class RoomEventHandler {
  constructor(private room: GameRoom) {}

  register() {
    this.setupLifecycleEvents()
    this.setupCollisionCallbacks()
  }

  private setupLifecycleEvents() {
    // Player events
    eventBus.onRoomEventPlayerJoin(this.room.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Player joined ${data.player.sessionId}`)
      this.handlePlayerJoined(data.player)
    })

    eventBus.onRoomEventPlayerLeft(this.room.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Player left ${data.player.sessionId}`)
      this.handlePlayerLeft(data.player)
    })

    // Mob events
    eventBus.onRoomEventMobSpawn(this.room.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Mob spawned ${data.mob.id}`)
      this.handleMobSpawned(data.mob)
    })

    eventBus.onRoomEventMobRemove(this.room.roomId, data => {
      console.log(`🎯 EVENT HANDLER: Mob removed ${data.mob.id}`)
      this.handleMobRemoved(data.mob)
    })
  }

  private setupCollisionCallbacks() {
    // Projectile vs Player
    this.room.physicsManager.onCollision('projectile', 'player', (bodyA, bodyB) => {
      const projectileData = this.room.physicsManager.getEntityDataFromBody(bodyA)
      const playerData = this.room.physicsManager.getEntityDataFromBody(bodyB)
      if (projectileData && playerData) {
        const projectile = this.room.state.projectiles.get(projectileData.id)
        const player = this.room.state.players.get(playerData.id)
        if (projectile && player) {
          this.room.projectileManager.handleEntityCollision(projectile, player)
        }
      }
    })

    // Projectile vs Mob
    this.room.physicsManager.onCollision('projectile', 'mob', (bodyA, bodyB) => {
      const projectileData = this.room.physicsManager.getEntityDataFromBody(bodyA)
      const mobData = this.room.physicsManager.getEntityDataFromBody(bodyB)
      if (projectileData && mobData) {
        const projectile = this.room.state.projectiles.get(projectileData.id)
        const mob = this.room.state.mobs.get(mobData.id)
        if (projectile && mob) {
          this.room.projectileManager.handleEntityCollision(projectile, mob)
        }
      }
    })

    // Projectile vs Boundary
    this.room.physicsManager.onCollision('projectile', 'boundary', (bodyA, bodyB) => {
      const projectileData = this.room.physicsManager.getEntityDataFromBody(bodyA)
      if (projectileData) {
        const projectile = this.room.state.projectiles.get(projectileData.id)
        if (projectile) {
          this.room.projectileManager.handleBoundaryCollision(projectile)
        }
      }
    })

    // Projectile vs Projectile
    this.room.physicsManager.onCollision('projectile', 'projectile', (bodyA, bodyB) => {
      const projAData = this.room.physicsManager.getEntityDataFromBody(bodyA)
      const projBData = this.room.physicsManager.getEntityDataFromBody(bodyB)
      if (projAData && projBData) {
        const projA = this.room.state.projectiles.get(projAData.id)
        const projB = this.room.state.projectiles.get(projBData.id)
        if (projA && projB) {
          this.room.projectileManager.handleProjectileCollision(projA, projB)
        }
      }
    })
  }

  // --- Implementations ---

  private handlePlayerJoined(player: Player): void {
    console.log(`👤 PLAYER JOINED: ${player.sessionId} - Setting up physics`)
    this.room.physicsManager.createPlayerBody(player)
    console.log(`✅ PLAYER SETUP COMPLETE: ${player.sessionId}`)
  }

  private handlePlayerLeft(player: Player): void {
    console.log(`👤 PLAYER LEFT: ${player.sessionId} - Cleaning up physics`)
    this.room.physicsManager.removeBody(player.id)
    console.log(`✅ PLAYER CLEANUP COMPLETE: ${player.sessionId}`)
  }

  private handleMobSpawned(mob: Mob): void {
    console.log(`👹 MOB SPAWNED: ${mob.id} - Setting up physics`)
    this.room.physicsManager.createMobBody(mob)
    console.log(`✅ MOB SETUP COMPLETE: ${mob.id}`)
  }

  private handleMobRemoved(mob: Mob): void {
    console.log(`👹 MOB REMOVED: ${mob.id} - Cleaning up physics`)
    this.room.physicsManager.removeBody(mob.id)
    console.log(`✅ MOB CLEANUP COMPLETE: ${mob.id}`)
  }
}
