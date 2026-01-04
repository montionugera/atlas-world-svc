import { GameState } from '../schemas/GameState'
import { BattleModule } from './BattleModule'
import { ZoneEffect } from '../schemas/ZoneEffect'
import { eventBus } from '../events/EventBus'
import * as crypto from 'crypto'
import { SKILLS } from '../config/skills'

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
    skillId: string,
    effects: { type: string, value: number, chance?: number, interval?: number, duration?: number }[],
    radius: number = 2,
    castTime: number = 1000,
    duration: number = 5000,
    tickRate: number = 0
  ): ZoneEffect {
    const id = `zone-${crypto.randomUUID()}`
    
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
    zone.skillId = skillId
    
    // Set casting state on owner if it's a player
    if (castTime > 0) {
        const owner = this.battleModule.getEntity(ownerId);
        if (owner && (owner as any).isCasting !== undefined) {
            (owner as any).isCasting = true;
            (owner as any).castingUntil = Date.now() + castTime;
            (owner as any).castDuration = castTime;
        }
    }

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
           // Interruption Logic: Check if owner is stunned or dead (Final Check)
           const ownerStart = this.battleModule.getEntity(zone.ownerId);
           if (ownerStart && (!ownerStart.isAlive || ownerStart.isStunned)) {
               console.log(`🚫 ZONE INTERRUPTED (Final Check): ${id} owner ${ownerStart.id} is stunned/dead`);
               this.cleanupCastingState(ownerStart);
               toRemove.push(id);
               continue;
           }

           zone.isActive = true
           zone.activatedAt = now
           
           // Clear Casting State on Owner
           if (zone.castTime > 0) {
               const ownerEnd = this.battleModule.getEntity(zone.ownerId);
               if (ownerEnd && (ownerEnd as any).isCasting !== undefined) {
                   (ownerEnd as any).isCasting = false;
                   // console.log(`✨ CAST COMPLETE: ${ownerEnd.id}`);
               }
           }
           
           // Initialize lastTickTime to 0 to ensure one-shot logic works (0 < activatedAt)
           zone.lastTickTime = 0 
           console.log(`⚠️ ZONE ACTIVATED: ${id}`)
           
           // Trigger Cooldowns on Owner
           // Only for players as mobs use AI cooldowns
           const ownerEntity = this.battleModule.getEntity(zone.ownerId);
           if (ownerEntity && (ownerEntity as any).performAction && zone.skillId) {
               const skill = SKILLS[zone.skillId];
               if (skill) {
                   (ownerEntity as any).performAction(skill.id, skill.cooldown, skill.gcd);
                   // console.log(`⏳ COOLDOWN STARTED: ${skill.id} for ${ownerEntity.id} (after cast)`);
               }
           }
        } else {
           // Still Casting: Immediate Interruption Check
           const ownerCasting = this.battleModule.getEntity(zone.ownerId);
           if (ownerCasting && (!ownerCasting.isAlive || ownerCasting.isStunned)) {
               console.log(`🚫 ZONE INTERRUPTED (Immediate): ${id} owner ${ownerCasting.id} is stunned/dead`);
               this.cleanupCastingState(ownerCasting);
               toRemove.push(id);
           }
           continue 
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
        // Continuous DOT logic
        // For first tick: lastTickTime is 0. 0 + tickRate might use 'now' logic?
        // Wait, if lastTickTime is 0, now - 0 >= tickRate is TRUE. So it ticks immediately.
        // That is correct for DOTs usually (tick on start).
        // But for one-shot, we check (lastTickTime < activatedAt).
        
        if (now - zone.lastTickTime >= zone.tickRate) {
           shouldProc = true
           zone.lastTickTime = now
        }
      } else {
        // Continuous/One-shot logic (TickRate == 0)
        // Only proc if we haven't procced since activation
        if (zone.lastTickTime < zone.activatedAt) {
           shouldProc = true
           // Note: We do NOT remove here automatically anymore.
           // Removal is strictly handled by Duration Logic or specific 'Instant' flag if we had one.
           // If duration is 0 or small, it will be removed by block 2.
           zone.lastTickTime = now // Mark as processed
        }
      }

      if (shouldProc) {
         // UNIQUE EVENT ID generation for this tick
         // Format: zoneId-tickTimestamp-random to ensure uniqueness across ticks
         // UNIQUE EVENT ID generation for this tick
         // Format: zoneId-tickTimestamp-shortUUID to ensure uniqueness
         const eventId = `${zone.id}-tick-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
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
                case 'burn':
                case 'poison':
                case 'regen':
                    // Pass full options for DOTs/Statuses
                    this.battleModule.applyStatusEffect(
                        target, 
                        effect.type, 
                        effect.duration || 1000, // Use effect duration as 3rd arg
                        effect.chance, 
                        { 
                            eventId: `${eventId}-status-${effect.type}`,
                            interval: effect.interval,
                            value: effect.value, // Pass value as 'value' (magnitude) for DOT
                            sourceId: zone.ownerId
                        }
                    );
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

  private cleanupCastingState(owner: any) {
       // Reset Casting State on Owner to update Client UI
       if ((owner as any).castDuration !== undefined) {
           (owner as any).castDuration = 0;
           (owner as any).castingUntil = 0;
           if ((owner as any).isCasting !== undefined) {
              (owner as any).isCasting = false;
           }
       }
  }
}
