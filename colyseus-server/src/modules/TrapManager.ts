import { GameState } from '../schemas/GameState'
import { BattleModule } from './BattleModule'
import { Trap } from '../schemas/Trap'
import { eventBus } from '../events/EventBus'

export class TrapManager {
  private gameState: GameState
  private battleModule: BattleModule

  constructor(gameState: GameState, battleModule: BattleModule) {
    this.gameState = gameState
    this.battleModule = battleModule
  }

  createTrap(
    x: number,
    y: number,
    ownerId: string,
    effectType: 'damage' | 'freeze' | 'stun' = 'damage',
    effectValue: number = 10,
    triggerRadius: number = 2,
    armDelay: number = 1000
  ): Trap {
    const id = `trap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const trap = new Trap(id, x, y, ownerId, effectType, effectValue, triggerRadius, armDelay)
    
    // Add to game state (assuming traps map exists, need to add it to GameState later)
    // this.gameState.traps.set(id, trap)
    // For now we will return it, integration step will add traps map to GameState
    
    console.log(`💣 TRAP CREATED: ${id} at ${x},${y} type=${effectType}`)
    return trap
  }

  update(traps: Map<string, Trap>) {
    const toRemove: string[] = []

    for (const [id, trap] of traps.entries()) {
      // 1. Check arming status
      if (!trap.isArmed) {
        if (trap.checkArming()) {
            console.log(`⚠️ TRAP ARMED: ${id}`)
        }
        continue
      }

      // 2. Check triggering against Players (and potentially mobs)
      for (const player of this.gameState.players.values()) {
        if (!player.isAlive) continue

        if (trap.shouldTrigger(player)) {
            this.triggerTrap(trap, player)
            toRemove.push(id)
            break // Trap triggered, move to next trap
        }
      }
      
      // Also check against mobs
       for (const mob of this.gameState.mobs.values()) {
        if (!mob.isAlive) continue

        if (trap.shouldTrigger(mob)) {
            this.triggerTrap(trap, mob)
            toRemove.push(id)
            break 
        }
      }
    }

    // Remove triggered traps
    for (const id of toRemove) {
        traps.delete(id)
    }
  }

  private triggerTrap(trap: Trap, target: any) {
    console.log(`💥 TRAP TRIGGERED: ${trap.id} hit ${target.id} (${trap.effectType})`)
    
    // Emit event for visuals
    eventBus.emitRoomEvent(this.gameState.roomId, 'trap:triggered' as any, { 
        trapId: trap.id, 
        targetId: target.id,
        x: trap.x,
        y: trap.y,
        type: trap.effectType
    } as any)

    // Apply effect
    if (trap.effectType === 'damage') {
        this.battleModule.applyDamage(target, trap.effectValue)
    } else if (trap.effectType === 'freeze' || trap.effectType === 'stun') {
        this.battleModule.applyStatusEffect(target, trap.effectType, trap.effectValue)
    }
  }
}
