import { GameRoom } from '../GameRoom'
import { eventBus } from '../../events/EventBus'
import { Player } from '../../schemas/Player'
import { Mob } from '../../schemas/Mob'
import { MeleeAttackStrategy } from '../../ai/strategies/MeleeAttackStrategy'

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

    // NPC events
    eventBus.onRoomEventNPCSpawn(this.room.roomId, data => {
      console.log(`🎯 EVENT HANDLER: NPC spawned ${data.npc.id}`)
      this.handleNPCSpawned(data.npc)
    })

    eventBus.onRoomEventNPCRemove(this.room.roomId, data => {
      console.log(`🎯 EVENT HANDLER: NPC removed ${data.npc.id}`)
      this.handleNPCRemoved(data.npc)
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

  private handleNPCSpawned(npc: any): void {
    console.log(`🐾 NPC SPAWNED: ${npc.id} - Setting up physics and combat`)
    this.room.physicsManager.createNPCBody(npc)
    // Equip npc with melee attack strategy
    npc.attackStrategies = [new MeleeAttackStrategy(this.room.projectileManager, this.room.state)]
    console.log(`✅ NPC SETUP COMPLETE: ${npc.id}`)
  }

  private handleNPCRemoved(npc: any): void {
    console.log(`🐾 NPC REMOVED: ${npc.id} - Cleaning up physics`)
    this.room.physicsManager.removeBody(npc.id)
    console.log(`✅ NPC CLEANUP COMPLETE: ${npc.id}`)
  }
}
