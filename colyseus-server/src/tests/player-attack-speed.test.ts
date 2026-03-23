import { Player } from '../schemas/Player'
import { WEAPONS } from '../config/combatConfig'
import {
  ASPD_EPS,
  computeAgiGapFill,
  computeEffectiveAspd,
  computeMeleeCycleMs,
  resolvePlayerMeleeAttackTiming,
  splitWindUpDown,
} from '../combat/playerAttackSpeed'

describe('playerAttackSpeed', () => {
  test('computeAgiGapFill(70) matches tiered example', () => {
    expect(computeAgiGapFill(70)).toBeCloseTo(0.63, 6)
  })

  test('computeAgiGapFill clamps AGI to 1–99', () => {
    expect(computeAgiGapFill(0)).toBe(computeAgiGapFill(1))
    expect(computeAgiGapFill(200)).toBe(computeAgiGapFill(99))
  })

  test('computeAgiGapFill(1) is small and at most 1', () => {
    const g = computeAgiGapFill(1)
    expect(g).toBeGreaterThanOrEqual(0)
    expect(g).toBeLessThanOrEqual(1)
  })

  test('computeAgiGapFill(99) is at most 1', () => {
    expect(computeAgiGapFill(99)).toBeLessThanOrEqual(1)
  })

  test('sword band + AGI 70 → effectiveAspd ~2.39 and cycle ~418ms', () => {
    const min = WEAPONS.basic_sword.aspdMin!
    const max = WEAPONS.basic_sword.aspdMax!
    const eff = computeEffectiveAspd(70, min, max)
    expect(eff).toBeCloseTo(2.39, 2)
    const cycle = computeMeleeCycleMs(eff)
    expect(cycle).toBeCloseTo(1000 / 2.39, 0)
  })

  test('splitWindUpDown sums to rounded cycle', () => {
    const { windUpMs, windDownMs } = splitWindUpDown(418.4, 100 / 900)
    expect(windUpMs + windDownMs).toBe(Math.round(418.4))
    expect(windUpMs).toBeGreaterThanOrEqual(1)
    expect(windDownMs).toBeGreaterThanOrEqual(1)
  })

  test('computeMeleeCycleMs respects ASPD_EPS', () => {
    expect(computeMeleeCycleMs(0)).toBe(1000 / ASPD_EPS)
  })

  test('resolvePlayerMeleeAttackTiming returns null for great_bow', () => {
    const p = new Player('bow-test', 'B', 0, 0)
    p.equipWeapon('great_bow')
    expect(resolvePlayerMeleeAttackTiming(p)).toBeNull()
    expect(p.attackDelay).toBe(900)
  })

  test('resolvePlayerMeleeAttackTiming for sword scales with agiFromEquipment', () => {
    const p = new Player('s-test', 'S', 0, 0)
    p.equipWeapon('basic_sword')
    p.agiFromEquipment = 60
    p.recalculateStats()
    expect(p.agi).toBe(70)
    const t = resolvePlayerMeleeAttackTiming(p)!
    expect(t.gapFill).toBeCloseTo(0.63, 4)
    expect(t.effectiveAspd).toBeCloseTo(2.39, 2)
    expect(t.attackDelayMs).toBe(t.windUpMs + t.windDownMs)
    expect(p.attackDelay).toBe(t.attackDelayMs)
  })

  test('dagger has shorter attackDelay than scythe at same AGI', () => {
    const p1 = new Player('d', 'D', 0, 0)
    p1.equipWeapon('dagger')
    p1.agiFromEquipment = 50
    p1.recalculateStats()

    const p2 = new Player('c', 'C', 0, 0)
    p2.equipWeapon('scythe')
    p2.agiFromEquipment = 50
    p2.recalculateStats()

    expect(p1.attackDelay).toBeLessThan(p2.attackDelay)
  })
})
