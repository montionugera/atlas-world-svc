/**
 * Base combat stats for players and mobs (HP, atk/def, movement).
 */

export type BaseStat = {
  agi: number
  str: number
  vit: number
  dex: number
}

const PRIMARY_MIN = 1
const PRIMARY_MAX = 99

export function clampPrimaryStat(n: number): number {
  return Math.min(PRIMARY_MAX, Math.max(PRIMARY_MIN, Math.floor(n)))
}

/** Apply partial overrides to defaults; every field is clamped 1–99. */
export function mergeBaseStat(defaults: BaseStat, partial?: Partial<BaseStat>): BaseStat {
  return {
    agi: clampPrimaryStat(partial?.agi ?? defaults.agi),
    str: clampPrimaryStat(partial?.str ?? defaults.str),
    vit: clampPrimaryStat(partial?.vit ?? defaults.vit),
    dex: clampPrimaryStat(partial?.dex ?? defaults.dex),
  }
}

export interface CombatStats {
  maxHealth: number
  pAtk: number
  mAtk: number
  attackRange: number
  atkWindDownTime: number // milliseconds (recovery after attack)
  atkWindUpTime: number // Delay before attack executes
  pDef: number
  mDef: number
  armor: number
  radius: number
  density: number
  chaseRange: number
  maxMoveSpeed: number
}

export type PlayerCombatStats = CombatStats & { baseStat: BaseStat }
export type MobCombatStats = CombatStats & { baseStat: BaseStat }

const PLAYER_BASE_STAT: BaseStat = { agi: 10, str: 10, vit: 10, dex: 10 }
const MOB_BASE_STAT: BaseStat = { agi: 10, str: 10, vit: 10, dex: 10 }

export const PLAYER_STATS: PlayerCombatStats = {
  maxHealth: 100,
  pAtk: 25,
  mAtk: 10,
  attackRange: 3,
  atkWindDownTime: 800, // recovery time (Total Cycle ~900ms)
  atkWindUpTime: 100,
  pDef: 1,
  mDef: 1,
  armor: 0,
  radius: 1.3, // Player radius must not exceed 1.3
  density: 0.8,
  chaseRange: 15,
  maxMoveSpeed: 20,
  baseStat: PLAYER_BASE_STAT,
} as const

export const MOB_STATS: MobCombatStats = {
  maxHealth: 100,
  pAtk: 20,
  mAtk: 0,
  attackRange: 1.5,
  atkWindDownTime: 2000,
  atkWindUpTime: 0, // Mobs usually use strategy-specific windups
  pDef: 2,
  mDef: 1,
  armor: 1,
  radius: 4,
  density: 1.2,
  chaseRange: 15,
  maxMoveSpeed: 8,
  baseStat: MOB_BASE_STAT,
} as const

export const MOB_TYPE_STATS = {
  aggressive: {
    attackRange: 2.5,
    chaseRange: 25,
  },
  defensive: {
    attackRange: 1.0,
    chaseRange: 15,
  },
  balanced: {
    attackRange: 1.5,
    chaseRange: 20,
  },
} as const
