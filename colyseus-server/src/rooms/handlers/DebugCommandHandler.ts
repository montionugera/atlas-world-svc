import { Client } from 'colyseus'
import { GameRoom } from '../GameRoom'
import * as planck from 'planck'

export class DebugCommandHandler {
  constructor(private room: GameRoom) {}

  register() {
    this.room.onMessage('debug_spawn_trap', this.handleSpawnTrap.bind(this))
    this.room.onMessage('debug_teleport', this.handleTeleport.bind(this))
    this.room.onMessage('debug_spawn_mob', this.handleSpawnMob.bind(this))
    this.room.onMessage('debug_force_die', this.handleForceDie.bind(this))
    this.room.onMessage('player_respawn', this.handlePlayerRespawn.bind(this))
  }

  private handleSpawnTrap(client: Client, data: { type: string }) {
    const player = this.room.state.getPlayer(client.sessionId)
    if (!player) return
    
    const type = (data && data.type) || 'damage'
    console.log(`⚡ DEBUG SPAWN TRAP: near ${client.sessionId}`)
    
    const zone = this.room.zoneEffectManager.createZoneEffect(
      player.x, 
      player.y, 
      player.id, 
      'debug_trap',
      [{ type: type, value: type === 'damage' ? 5 : 3000 }], 
      2.5, // radius
      500,
      5000,
      200
    )
    
    this.room.state.zoneEffects.set(zone.id, zone)
  }

  private handleTeleport(client: Client, data: { x: number; y: number }) {
    const player = this.room.state.getPlayer(client.sessionId)
    if (!player) return
    
    console.log(`⚡ DEBUG TELEPORT: ${client.sessionId} to ${data.x}, ${data.y}`)
    
    // Update physics body position
    const body = this.room.physicsManager.getBody(client.sessionId)
    if (body) {
      body.setPosition(planck.Vec2(data.x, data.y))
      // Reset velocity
      body.setLinearVelocity(planck.Vec2(0, 0))
    }
    
    // Update state position (will be synced next tick)
    player.x = data.x
    player.y = data.y
  }

  private handleSpawnMob(client: Client, data: { x: number; y: number }) {
    console.log(`⚡ DEBUG SPAWN MOB: near ${client.sessionId} at ${data.x}, ${data.y}`)
    this.room.mobLifeCycleManager.spawnMobAt(data.x, data.y)
  }

  private handleForceDie(client: Client) {
    const player = this.room.state.getPlayer(client.sessionId)
    if (player) {
       console.log(`💀 DEBUG: Force die for ${client.sessionId}`)
       player.die()
    }
  }

  private handlePlayerRespawn(client: Client) {
    const player = this.room.state.getPlayer(client.sessionId)
    if (!player) return
    
    console.log(`♻️ PLAYER RESPAWN: ${client.sessionId}`)
    
    // Respawn at stored spawn location (from gameplay settings)
    const respawnX = player.settingGameplay.spawnX
    const respawnY = player.settingGameplay.spawnY
    
    player.respawn(respawnX, respawnY)
    
    // Update physics body
    const body = this.room.physicsManager.getBody(client.sessionId)
    if (body) {
       body.setPosition(planck.Vec2(respawnX, respawnY))
       body.setLinearVelocity(planck.Vec2(0, 0))
       body.setAwake(true)
       body.setActive(true) // Ensure body is active
       body.setAngularVelocity(0)
    }
  }
}
