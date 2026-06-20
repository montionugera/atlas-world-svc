import { BattleModule } from '../modules/BattleModule'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'

describe('char: BattleModule applyDamage / respawn', () => {
  let bm: BattleModule
  let state: GameState
  const mob = () => new Mob({
    id: 't', x: 0, y: 0, radius: 1, maxHealth: 100, pAtk: 10, attackRange: 5,
    atkWindDownTime: 1000, pDef: 0, mDef: 0, armor: 0, density: 1,
  })
  beforeEach(() => { state = new GameState('m', 'r'); bm = new BattleModule(state) })
  afterEach(() => { state.stopAI() })

  it('non-lethal damage reduces HP and returns false', () => {
    const t = mob()
    expect(bm.applyDamage(t, 30)).toBe(false)
    expect(t.currentHealth).toBe(70)
    expect(t.isAlive).toBe(true)
  })
  it('lethal damage triggers die() and returns true', () => {
    const t = mob()
    expect(bm.applyDamage(t, 100)).toBe(true)
    expect(t.currentHealth).toBe(0)
    expect(t.isAlive).toBe(false)
    expect(t.diedAt).toBeGreaterThan(0)
  })
  it('respawnEntity restores a dead entity to full and clears diedAt', () => {
    const t = mob()
    bm.applyDamage(t, 100)
    bm.respawnEntity(t, 5, 6)
    expect(t.isAlive).toBe(true)
    expect(t.currentHealth).toBe(t.maxHealth)
    expect(t.diedAt).toBe(0)
    expect(t.x).toBe(5)
    expect(t.y).toBe(6)
  })
})
