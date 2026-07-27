import { DamageCalculator } from '../modules/combat/DamageCalculator'
import { Mob } from '../schemas/Mob'

// Mirrors the Phase 0 damage table (char-battlemodule-damage) directly against
// DamageCalculator: afterDefense = max(1, base - min(totalDef, base*0.8)) where
// totalDef = (magical ? mDef : pDef) + armor; final = max(1, floor(afterDefense * element)).
describe('DamageCalculator.calculate', () => {
  const target = (over: Partial<{ pDef: number; mDef: number; armor: number }>) =>
    new Mob({
      id: 't',
      x: 0,
      y: 0,
      radius: 1,
      maxHealth: 100,
      pAtk: 10,
      attackRange: 5,
      atkWindDownTime: 1000,
      pDef: over.pDef ?? 0,
      mDef: over.mDef ?? 0,
      armor: over.armor ?? 0,
      density: 1,
    })

  // --- behaviour preservation: identical numbers to the pre-element formula ---
  it('physical: subtracts pDef + armor', () => {
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'physical',
        attackElement: 'neutral',
        target: target({ pDef: 10, armor: 5 }),
      })
    ).toBe(85)
  })
  it('magical: subtracts mDef + armor (ignores pDef)', () => {
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'magical',
        attackElement: 'neutral',
        target: target({ pDef: 999, mDef: 4, armor: 5 }),
      })
    ).toBe(91)
  })
  it('caps reduction at 80% of base damage', () => {
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'physical',
        attackElement: 'neutral',
        target: target({ pDef: 500 }),
      })
    ).toBe(20)
  })
  it('never reduces below 1', () => {
    expect(
      DamageCalculator.calculate({
        baseDamage: 1,
        damageType: 'physical',
        attackElement: 'neutral',
        target: target({ pDef: 500 }),
      })
    ).toBe(1)
  })
  it('floors fractional results', () => {
    expect(
      DamageCalculator.calculate({
        baseDamage: 10,
        damageType: 'physical',
        attackElement: 'neutral',
        target: target({ pDef: 0.5 }),
      })
    ).toBe(9)
  })

  // --- element behaviour ---
  it('doubles damage on elemental advantage, after defense', () => {
    const t = target({ pDef: 10, armor: 5 })
    t.element = 'fire' // 85 after defense, water > fire => x2
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'physical',
        attackElement: 'water',
        target: t,
      })
    ).toBe(170)
  })
  it('halves damage on elemental disadvantage', () => {
    const t = target({ pDef: 10, armor: 5 })
    t.element = 'water' // 85 after defense, fire vs water => x0.5 => 42.5 => 42
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'physical',
        attackElement: 'fire',
        target: t,
      })
    ).toBe(42)
  })
  it('never lets a resisted hit fall below 1', () => {
    const t = target({ pDef: 500 })
    t.element = 'water'
    // afterDefense = 1, x0.5 = 0.5, floor = 0 -> clamped back to 1
    expect(
      DamageCalculator.calculate({
        baseDamage: 1,
        damageType: 'physical',
        attackElement: 'fire',
        target: t,
      })
    ).toBe(1)
  })
  it('treats an unrecognised element as neutral', () => {
    const t = target({ pDef: 10, armor: 5 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(t as any).element = 'lightning'
    expect(
      DamageCalculator.calculate({
        baseDamage: 100,
        damageType: 'physical',
        attackElement: 'fire',
        target: t,
      })
    ).toBe(85)
  })
})
