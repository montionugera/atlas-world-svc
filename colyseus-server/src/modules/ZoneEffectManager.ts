import { GameState } from '../schemas/GameState'
import { BattleModule } from './BattleModule'
import { ZoneEffect } from '../schemas/ZoneEffect'
import { eventBus } from '../events/EventBus'

export class ZoneEffectManager {
  private gameState: GameState
  private battleModule: BattleModule

  constructor(gameState: GameState, battleModule: BattleModule) {
    this.gameState = gameState
    this.battleModule = battleModule
  }

  createZoneEffect(
    x: number,
    y: number,
    ownerId: string,
    effectType: 'damage' | 'freeze' | 'stun' | 'heal',
    effectValue: number,
    radius: number = 2,
    castTime: number = 1000,
    duration: number = 5000,
    tickRate: number = 0
  ): ZoneEffect {
    const id = `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    
    const zone = new ZoneEffect(
      id, 
      x, 
      y, 
      ownerId, 
      effectType, 
      effectValue, 
      radius, 
      castTime, 
      duration, 
      tickRate
    )
    
    console.log(`🌀 ZONE CREATED: ${id} at ${x},${y} type=${effectType} cast=${castTime}ms dur=${duration}ms tick=${tickRate}ms`)
    return zone
  }

  update(zones: Map<string, ZoneEffect>) {
    const toRemove: string[] = []
    const now = Date.now()

    for (const [id, zone] of zones.entries()) {
      // 1. Casting Logic
      if (!zone.isActive) {
        if (now - zone.createdAt >= zone.castTime) {
           zone.isActive = true
           zone.activatedAt = now
           zone.lastTickTime = now - zone.tickRate // Allow immediate tick if needed
           console.log(`⚠️ ZONE ACTIVATED: ${id}`)
        } else {
           continue // Still casting
        }
      }

      // 2. Duration Logic
      if (zone.duration > 0 && now - zone.activatedAt >= zone.duration) {
         console.log(`🛑 ZONE EXPIRED: ${id}`)
         toRemove.push(id)
         continue
      }

      // 3. Ticking Logic
      // If tickRate is 0, it hits once and stays active until duration (or removed if intended to be one-shot logic handled elsewhere)
      // If tickRate > 0, checks periodic application
      let shouldProc = false
      if (zone.tickRate > 0) {
        if (now - zone.lastTickTime >= zone.tickRate) {
           shouldProc = true
           zone.lastTickTime = now
        }
      } else {
        // Continuous/One-shot logic:
        // If it's pure one-shot with no duration, we remove it. 
        // If it has duration but no ticks (e.g. constant slow field), we might apply every frame or just once.
        // For 'damage' with 0 tickRate, we assume instant trigger and remove.
        if (zone.effectType === 'damage') {
           shouldProc = true
           toRemove.push(id) // Remove after one hit
        }
      }

      if (shouldProc) {
         this.procEffect(zone)
      }
    }

    // Remove expired/consumed zones
    for (const id of toRemove) {
        zones.delete(id)
    }
  }

  private procEffect(zone: ZoneEffect) {
      // Check players
      for (const player of this.gameState.players.values()) {
         if (!player.isAlive) continue
         if (zone.shouldTrigger(player)) {
             this.applyZoneEffect(zone, player)
         }
      }
      
      // Check mobs
      for (const mob of this.gameState.mobs.values()) {
         if (!mob.isAlive) continue
         if (zone.shouldTrigger(mob)) {
             this.applyZoneEffect(zone, mob)
         }
      }
  }

  private applyZoneEffect(zone: ZoneEffect, target: any) {
    // Determine visual event type
    let procType = zone.effectType
    
    // Apply effect
    if (zone.effectType === 'damage') {
        this.battleModule.applyDamage(target, zone.effectValue)
    } else if (zone.effectType === 'heal') {
        this.battleModule.healEntity(target, zone.effectValue)
    } else if (zone.effectType === 'freeze' || zone.effectType === 'stun') {
        this.battleModule.applyStatusEffect(target, zone.effectType, zone.effectValue)
    }

    // Emit event for visuals (throttled logs)
    if (Math.random() < 0.1) {
        // console.log(`💥 ZONE PROC: ${zone.id} hit ${target.id} (${zone.effectType})`)
    }
    
    eventBus.emitRoomEvent(this.gameState.roomId, 'trap:triggered' as any, { 
        trapId: zone.id, 
        targetId: target.id,
        x: zone.x,
        y: zone.y,
        type: zone.effectType
    } as any)
  }
}
