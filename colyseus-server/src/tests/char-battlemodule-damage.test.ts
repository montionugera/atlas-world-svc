import { BattleModule } from '../modules/BattleModule'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'

// Pins BattleModule.calculateDamage: finalDamage = floor(max(1, base - min(totalDef, base*0.8)))
// where totalDef = (magical ? mDef : pDef) + armor.
describe('char: BattleModule.calculateDamage', () => {
  let bm: BattleModule
  let state: GameState

  const target = (over: Partial<{ pDef: number; mDef: number; armor: number }>) =>
    new Mob({
      id: 't', x: 0, y: 0, radius: 1, maxHealth: 100, pAtk: 10, attackRange: 5,
      atkWindDownTime: 1000, pDef: over.pDef ?? 0, mDef: over.mDef ?? 0,
      armor: over.armor ?? 0, density: 1,
    })

  beforeEach(() => { state = new GameState('m', 'r'); bm = new BattleModule(state) })
  afterEach(() => { state.stopAI() })

  it('physical: subtracts pDef + armor', () => {
    expect(bm.calculateDamage(100, 'physical', target({ pDef: 10, armor: 5 }))).toBe(85)
  })
  it('magical: subtracts mDef + armor (ignores pDef)', () => {
    expect(bm.calculateDamage(100, 'magical', target({ pDef: 999, mDef: 4, armor: 5 }))).toBe(91)
  })
  it('caps reduction at 80% of base damage', () => {
    expect(bm.calculateDamage(100, 'physical', target({ pDef: 500 }))).toBe(20)
  })
  it('never reduces below 1', () => {
    expect(bm.calculateDamage(1, 'physical', target({ pDef: 500 }))).toBe(1)
  })
  it('floors fractional results', () => {
    expect(bm.calculateDamage(10, 'physical', target({ pDef: 0.5 }))).toBe(9)
  })
})
