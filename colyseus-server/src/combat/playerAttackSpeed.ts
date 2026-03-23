/**
 * Player AGI → gap fill → effective ASPD (attacks/sec) → wind-up / wind-down ms.
 */
import type { Player } from '../schemas/Player'
import { PLAYER_STATS } from '../config/combatConfig'
import { getWeaponConfigForPlayer } from './attackDamage'

export const ASPD_EPS = 0.2

const AGI_MIN = 1
const AGI_MAX = 99

export type PlayerMeleeAttackTiming = {
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

export function resolvePlayerMeleeAttackTiming(player: Player): PlayerMeleeAttackTiming | null {
  const weapon = getWeaponConfigForPlayer(player)
  if (
    !weapon ||
    weapon.aspdMin === undefined ||
    weapon.aspdMax === undefined
  ) {
    return null
  }

  const gapFill = computeAgiGapFill(player.agi)
  const effectiveAspd = computeEffectiveAspd(player.agi, weapon.aspdMin, weapon.aspdMax)
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
