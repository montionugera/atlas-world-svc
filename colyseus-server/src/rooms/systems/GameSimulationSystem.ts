import { GameRoom } from '../GameRoom'
import { Player } from '../../schemas/Player'

export class GameSimulationSystem {
  constructor(private room: GameRoom) {}

  update(deltaTime: number) {
    try {
      this.updatePhysicsBodies()
      
      this.room.physicsManager.update(deltaTime, this.room.state.players, this.room.state.mobs, this.room.state.npcs)
      
      this.room.projectileManager.updateProjectiles(
        this.room.state.projectiles,
        deltaTime,
        this.room.physicsManager
      )

      this.updatePlayers(deltaTime)

      this.room.state.aiModule.update()
      this.room.mobLifeCycleManager.update()
      
      this.updateMobs(deltaTime)
      this.updateNPCs(deltaTime)
      this.cleanupDespawnedProjectiles(deltaTime)
      
      this.room.zoneEffectManager.update(this.room.state.zoneEffects)

      this.processBattleMessages()

      this.logSimulationHealth()
    } catch (error) {
      console.error(`❌ SIMULATION ERROR:`, error)
    }
  }

  private updatePhysicsBodies() {
    for (const projectile of this.room.state.projectiles.values()) {
      if (!this.room.physicsManager.getBody(projectile.id)) {
        this.room.physicsManager.createProjectileBody(projectile)
      }
    }
  }

  private updatePlayers(deltaTime: number) {
    this.room.state.players.forEach((player: Player) => {
      if (!player.isAlive) {
        player.input.clear()
        return
      }

      const context = {
        mobs: this.room.state.mobs,
        roomId: this.room.roomId,
        projectileManager: this.room.projectileManager,
        gameState: this.room.state
      };
      
      player.update(deltaTime, context)
      this.room.battleModule.updateCombatState(player, deltaTime)

      if (player.isBotMode && Math.random() < 0.01) {
         console.log(`[Server] Player ${player.sessionId} pos: ${player.x}, ${player.y}`)
      }

      if (player.processAttackInput(context)) {
        player.input.attack = false
        this.checkProjectileDeflection(player)
      }
    })
  }

  private updateMobs(deltaTime: number) {
    this.room.state.updateMobs()
    
    this.room.state.mobs.forEach(mob => {
        if (mob.isAlive) {
            this.room.battleModule.updateCombatState(mob, deltaTime)
        }
    })
  }

  private updateNPCs(deltaTime: number) {
    const now = Date.now()
    
    this.room.state.npcs.forEach(npc => {
        if (npc.isAlive) {
            npc.update(deltaTime, this.room.state)
            this.room.battleModule.updateCombatState(npc, deltaTime)
        } else {
            // Respawn logic
            if (npc.diedAt > 0 && now - npc.diedAt >= npc.respawnTimeMs) {
                const owner = this.room.state.players.get(npc.ownerId)
                if (owner && owner.isAlive) {
                    const spawnX = owner.x + 10
                    const spawnY = owner.y + 10
                    
                    // Respawn the entity (resets health, alive state, etc)
                    this.room.battleModule.respawnEntity(npc, spawnX, spawnY)
                    
                    // Re-create physics body after death removal
                    this.room.physicsManager.removeBody(npc.id) 
                    this.room.physicsManager.createNPCBody(npc)
                    
                    console.log(`🐾 NPC RESPAWNED: ${npc.id} near ${owner.id}`)
                }
            }
        }
    })
  }

  private cleanupDespawnedProjectiles(deltaTime: number) {
    const toDespawn: string[] = []
    for (const [id, projectile] of this.room.state.projectiles.entries()) {
      if (projectile.shouldDespawn()) {
        toDespawn.push(id)
        this.room.physicsManager.removeBody(id)
      }
    }

    this.room.state.updateProjectiles(deltaTime)
  }

  private processBattleMessages() {
    this.room.battleManager.processActionMessages().then((processedCount: number) => {
      if (processedCount > 0) {
        console.log(`⚔️ BATTLE: Processed ${processedCount} action messages`)
      }
    })
  }

  private checkProjectileDeflection(player: Player): void {
    if (!player.isAttacking) return

    for (const projectile of this.room.state.projectiles.values()) {
      if (projectile.isStuck) continue
      if (this.room.projectileManager.checkDeflection(projectile, player)) {
        console.log(`🛡️ DEFLECT: Player ${player.id} deflected projectile ${projectile.id}`)
      }
    }
  }

  private logSimulationHealth() {
    if (this.room.state.tick % 1000 === 0) {
      let mobsWithBodies = 0
      for (const mob of this.room.state.mobs.values()) {
        if (this.room.physicsManager.getBody(mob.id)) {
          mobsWithBodies++
        }
      }
      console.log(
        `🔄 SIMULATION HEALTH: tick=${this.room.state.tick}, mobs=${this.room.state.mobs.size}, mobsWithBodies=${mobsWithBodies}, npcs=${this.room.state.npcs.size}, players=${this.room.state.players.size}`
      )
    }
  }
}
