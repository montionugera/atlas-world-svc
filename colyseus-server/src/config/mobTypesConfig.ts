
/**
 * Mob Types Configuration
 * Defines mob archetypes with their attributes and spawn weights
 * New flexible attack system with detailed attack definitions
 */

/**
 * Re-export all types and definitions from the modular structure
 */
export * from './mobs'

/**
 * Get mob type by ID
 */
import { MOB_TYPES } from './mobs'
import { MobTypeConfig } from './mobs/types'

export function getMobTypeById(id: string): MobTypeConfig | undefined {
  return MOB_TYPES.find((type) => type.id === id)
}
