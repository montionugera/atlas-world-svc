import { GameRoom } from '../GameRoom'
import { eventBus, DamageProducedData } from '../../events/EventBus'
import { Projectile } from '../../schemas/Projectile'
import { Player } from '../../schemas/Player'
import { Mob } from '../../schemas/Mob'
import { MeleeAttackStrategy } from '../../ai/strategies/MeleeAttackStrategy'

export class RoomEventHandler {
  // Guards against reporting the same mob kill more than once — a single
  // BATTLE_DAMAGE_PRODUCED event confirms the kill, but corpse hits (e.g. AOE
  // overlap) can still fire the event again for an already-dead mob.
  private reportedMobKills = new Set<string>()

  constructor(private room: GameRoom) {}

  register() {
    this.setupLifecycleEvents()
    this.setupCollisionCallbacks()
    this.setupMetaEvents()
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

  /** After `stick()` on hit, push zero velocity to Planck so the body does not keep sliding. */
  private syncStuckProjectileBody(projectile: Projectile): void {
    if (!projectile.isStuck) return
    this.room.physicsManager.syncEntityToBody(projectile, projectile.id)
  }

  private setupCollisionCallbacks() {
    // Projectile vs Player or NPC (NPC uses same collision category as player)
    this.room.physicsManager.onCollision('projectile', 'player', (bodyA, bodyB) => {
      const projectileData = this.room.physicsManager.getEntityDataFromBody(bodyA)
      const targetData = this.room.physicsManager.getEntityDataFromBody(bodyB)
      if (projectileData && targetData) {
        const projectile = this.room.state.projectiles.get(projectileData.id)
        const target =
          this.room.state.players.get(targetData.id) ?? this.room.state.npcs.get(targetData.id)
        if (projectile && target) {
          this.room.projectileManager.handleEntityCollision(projectile, target)
          this.syncStuckProjectileBody(projectile)
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
          this.syncStuckProjectileBody(projectile)
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
          this.syncStuckProjectileBody(projectile)
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

  /**
   * Reports a MOB_KILLED match event the instant a player's hit brings a mob's
   * HP to 0 — BattleModule.applyDamage() calls target.die() *before* emitting
   * BATTLE_DAMAGE_PRODUCED, so `taker.isAlive === false` here reliably marks
   * the killing blow (not just any hit).
   */
  private setupMetaEvents() {
    eventBus.onRoomEventBattleDamageProduced(this.room.roomId, data => {
      this.handleDamageProduced(data)
    })
  }

  private handleDamageProduced(data: DamageProducedData): void {
    const { attacker, taker } = data
    if (taker.isAlive) return
    if (!(taker instanceof Mob)) return
    if (!(attacker instanceof Player)) return
    if (this.reportedMobKills.has(taker.id)) return

    this.reportedMobKills.add(taker.id)
    this.room.metaEventReporter.record({
      type: 'MOB_KILLED',
      userId: attacker.sessionId,
      targetId: taker.mobTypeId,
      count: 1,
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
