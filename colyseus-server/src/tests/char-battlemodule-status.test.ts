import { BattleModule } from '../modules/BattleModule'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'

describe('char: BattleModule status effects', () => {
  let bm: BattleModule
  let state: GameState
  const mob = () => new Mob({
    id: 't', x: 0, y: 0, radius: 1, maxHealth: 100, pAtk: 10, attackRange: 5,
    atkWindDownTime: 1000, pDef: 0, mDef: 0, armor: 0, density: 1,
  })
  beforeEach(() => { state = new GameState('m', 'r'); bm = new BattleModule(state) })
  afterEach(() => { state.stopAI(); jest.useRealTimers() })

  it('applies a status at full chance (no resistance)', () => {
    const t = mob()
    expect(bm.applyStatusEffect(t, 'stun', 500, 1.0)).toBe(true)
    expect(t.battleStatuses.has('stun')).toBe(true)
    expect(t.isStunned).toBe(true)
  })
  it('full resistance blocks the status', () => {
    const t = mob()
    t.setResistance('stun', 1.0)
    expect(bm.applyStatusEffect(t, 'stun', 500, 1.0)).toBe(false)
    expect(t.battleStatuses.has('stun')).toBe(false)
  })
  it('a DOT applies its value on tick once the interval elapses', () => {
    jest.useFakeTimers()
    const t = mob()
    bm.applyStatusEffect(t, 'burn', 1000, 1.0, { value: 7, interval: 100 })
    const hpAfterApply = t.currentHealth
    // BattleStatus.lastTick is initialized to Date.now() at construction, so we must advance
    // by at least `interval` (100ms) before the first tick fires.
    jest.setSystemTime(Date.now() + 150)
    bm.processStatusTicks(t)
    expect(t.currentHealth).toBe(hpAfterApply - 7)
  })
})
