import { AttackStrategy } from './AttackStrategy'
import { Mob } from '../../schemas/Mob'
import { Player } from '../../schemas/Player'
import { eventBus, RoomEventType, BattleAttackData } from '../../events/EventBus'

/**
 * Melee Attack Strategy
 * Close-range instant attack (existing behavior)
 */
export class MeleeAttackStrategy implements AttackStrategy {
  name = 'melee'

  getWindUpTime(): number {
    return 0 // Instant attack
  }

  canExecute(mob: Mob, target: Player): boolean {
    if (!target.isAlive) return false
    if (!mob.canAttack()) return false

    const distance = mob.getDistanceTo(target)
    const effectiveRange = mob.attackRange + mob.radius + target.radius
    return distance <= effectiveRange
  }

  execute(mob: Mob, target: Player, roomId: string): boolean {
    if (!this.canExecute(mob, target)) {
      console.log(`⚠️ MELEE: ${mob.id} can't execute melee attack on ${target.id}`)
      return false
    }

    // Emit battle attack event
    const attackData: BattleAttackData = {
      actorId: mob.id,
      targetId: target.id,
      damage: mob.attackDamage,
      range: mob.attackRange,
      roomId: roomId,
    }

    console.log(`🗡️ MELEE: ${mob.id} executing melee attack on ${target.id}, emitting BATTLE_ATTACK event`)
    eventBus.emitRoomEvent(roomId, RoomEventType.BATTLE_ATTACK, attackData)
    return true
  }
}

