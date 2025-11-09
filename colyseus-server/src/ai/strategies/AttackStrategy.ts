import { Mob } from '../../schemas/Mob'
import { Player } from '../../schemas/Player'

/**
 * Attack Strategy Interface
 * Allows mobs to have multiple attack types (melee, ranged, etc.)
 */
export interface AttackStrategy {
  name: string
  canExecute(mob: Mob, target: Player): boolean
  execute(mob: Mob, target: Player, roomId: string): boolean
  getWindUpTime(): number // ms before attack executes
}

