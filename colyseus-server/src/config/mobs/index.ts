
import { MobTypeConfig } from './types'
import { spearThrower } from './definitions/spearThrower'
import { hybrid } from './definitions/hybrid'
import { aggressive } from './definitions/aggressive'
import { defensive } from './definitions/defensive'
import { balanced } from './definitions/balanced'
import { doubleAttacker } from './definitions/doubleAttacker'

/**
 * Mob Type Definitions
 * Add new mob types here with their attributes
 */
export const MOB_TYPES: MobTypeConfig[] = [
  spearThrower,
  hybrid,
  aggressive,
  defensive,
  balanced,
  doubleAttacker,
]

export * from './types'
export * from './utils'
