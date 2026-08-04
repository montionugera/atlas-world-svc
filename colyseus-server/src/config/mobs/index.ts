import { MobTypeConfig } from './types'
import { spearThrower } from './definitions/spearThrower'
import { hybrid } from './definitions/hybrid'
import { aggressive } from './definitions/aggressive'
import { defensive } from './definitions/defensive'
import { balanced } from './definitions/balanced'
import { doubleAttacker } from './definitions/doubleAttacker'
import { thorncrownDrake } from './definitions/thorncrownDrake'

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
  thorncrownDrake,
]

export * from './types'
export * from './utils'
