/**
 * AGI → gap fill → effective ASPD (attacks/sec) → wind-up / wind-down ms.
 * Entity-agnostic; use for players (via equipped weapon) and mobs (via attack def ASPD bands).
 */
import { PLAYER_STATS, WEAPONS } from '../config/combatConfig'
import type { WorldLife } from '../schemas/WorldLife'

export const ASPD_EPS = 0.2

const AGI_MIN = 1
const AGI_MAX = 99

export type MeleeAttackTiming = {
  windUpMs: number
  windDownMs: number
  attackDelayMs: number
  effectiveAspd: number
  gapFill: number
}

export function computeAgiGapFill(agi: number): number {
  const a = Math.min(AGI_MAX, Math.max(AGI_MIN, Math.floor(agi)))
  const t1 = Math.floor(a / 3) * 0.01
  const t2 = Math.floor(a / 7) * 0.02
  const t3 = Math.floor(a / 15) * 0.05
  return Math.min(1, t1 + t2 + t3)
}

export function computeEffectiveAspd(agi: number, aspdMin: number, aspdMax: number): number {
  const gapFill = computeAgiGapFill(agi)
  return aspdMin + gapFill * (aspdMax - aspdMin)
}

export function computeMeleeCycleMs(effectiveAspd: number): number {
  return 1000 / Math.max(effectiveAspd, ASPD_EPS)
}

export function defaultWindUpRatio(): number {
  const up = PLAYER_STATS.atkWindUpTime
  const down = PLAYER_STATS.atkWindDownTime
  return up / (up + down)
}

export function splitWindUpDown(
  cycleMs: number,
  windUpRatio: number
): { windUpMs: number; windDownMs: number } {
  const cycle = Math.max(2, Math.round(cycleMs))
  let windUpMs = Math.max(1, Math.round(cycle * windUpRatio))
  let windDownMs = Math.max(1, cycle - windUpMs)
  if (windUpMs + windDownMs !== cycle) {
    windDownMs = cycle - windUpMs
  }
  return { windUpMs, windDownMs }
}

/**
 * When both ASPD bands are set, returns wind-up/down from AGI-scaled attack rate.
 * Otherwise returns null (caller uses static wind-up / legacy delays).
 */
export function resolveMeleeAttackTiming(
  agi: number,
  aspdMin?: number,
  aspdMax?: number
): MeleeAttackTiming | null {
  if (aspdMin === undefined || aspdMax === undefined) {
    return null
  }

  const gapFill = computeAgiGapFill(agi)
  const effectiveAspd = computeEffectiveAspd(agi, aspdMin, aspdMax)
  const cycleMs = computeMeleeCycleMs(effectiveAspd)
  const { windUpMs, windDownMs } = splitWindUpDown(cycleMs, defaultWindUpRatio())

  return {
    windUpMs,
    windDownMs,
    attackDelayMs: windUpMs + windDownMs,
    effectiveAspd,
    gapFill,
  }
}

export function resolvePlayerMeleeAttackTiming(
  entity: WorldLife & { equippedWeaponId: string }
): MeleeAttackTiming | null {
  if (!entity.equippedWeaponId) return null
  const weapon = WEAPONS[entity.equippedWeaponId]
  if (!weapon) return null
  return resolveMeleeAttackTiming(entity.stat.agi, weapon.aspdMin, weapon.aspdMax)
}
