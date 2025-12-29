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
    effects: { type: string, value: number, chance?: number }[],
    radius: number = 2,
    castTime: number = 1000,
    duration: number = 5000,
    tickRate: number = 0
  ): ZoneEffect {
    const id = `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    
    // Pass effects array to constructor
    const zone = new ZoneEffect(
      id, 
      x, 
      y, 
      ownerId, 
      effects, 
      radius, 
      castTime, 
      duration, 
      tickRate
    )
    
    console.log(`🌀 ZONE CREATED: ${id} at ${x},${y} cast=${castTime}ms dur=${duration}ms tick=${tickRate}ms`)
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
      let shouldProc = false
      if (zone.tickRate > 0) {
        if (now - zone.lastTickTime >= zone.tickRate) {
           shouldProc = true
           zone.lastTickTime = now
        }
      } else {
        // Continuous/One-shot logic:
        // If it has 'damage' effect and tickRate 0, assume instantaneous and remove
        const hasDamage = zone.effects.some(e => e.type === 'damage');
        if (hasDamage) {
           shouldProc = true
           toRemove.push(id) // Remove after one hit
        }
      }

      if (shouldProc) {
         // UNIQUE EVENT ID generation for this tick
         // Format: zoneId-tickTimestamp-random to ensure uniqueness across ticks
         const eventId = `${zone.id}-tick-${Date.now()}-${Math.random().toString(36).slice(2,4)}`;
         this.procEffect(zone, eventId)
      }
    }

    // Remove expired/consumed zones
    for (const id of toRemove) {
        zones.delete(id)
    }
  }

  private procEffect(zone: ZoneEffect, eventId: string) {
      // Check players
      for (const player of this.gameState.players.values()) {
         if (!player.isAlive) continue
         if (zone.shouldTrigger(player)) {
             this.applyZoneEffect(zone, player, eventId)
         }
      }
      
      // Check mobs
      for (const mob of this.gameState.mobs.values()) {
         if (!mob.isAlive) continue
         if (zone.shouldTrigger(mob)) {
             this.applyZoneEffect(zone, mob, eventId)
         }
      }
  }

  private applyZoneEffect(zone: ZoneEffect, target: any, eventId: string) {
    // Iterate through all effects
    // 1. Apply Status Effects & Heals FIRST
    // This allows simultaneous application with same Event ID
    zone.effects.forEach(effect => {
        if (effect.type === 'damage') return; // Skip damage for now

        if (effect.type === 'heal') {
            this.battleModule.healEntity(target, effect.value)
        } else {
            switch (effect.type) {
                case 'freeze':
                case 'stun':
                    // Pass chance and eventId (unique per effect type to allow simultaneous application)
                    this.battleModule.applyStatusEffect(target, effect.type, effect.value, effect.chance, { eventId: `${eventId}-status-${effect.type}` });
                    break;
            }
        }
    });

    // 2. Apply Damage LAST
    zone.effects.forEach(effect => {
        if (effect.type === 'damage') {
            this.battleModule.applyDamage(target, effect.value, { eventId: `${eventId}-damage` })
        }
    });

    // Determine primary type for visuals (first effect)
    const primaryType = zone.effects.length > 0 ? zone.effects[0].type : 'unknown';

    // Emit event for visuals (throttled logs)
    if (Math.random() < 0.1) {
        // console.log(`💥 ZONE PROC: ${zone.id} hit ${target.id} (${primaryType})`)
    }
    
    eventBus.emitRoomEvent(this.gameState.roomId, 'trap:triggered' as any, { 
        trapId: zone.id, 
        targetId: target.id,
        x: zone.x,
        y: zone.y,
        type: primaryType
    } as any)
  }
}
