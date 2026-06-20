import { ProjectileManager } from '../modules/ProjectileManager'
import { BattleModule } from '../modules/BattleModule'
import { BattleManager } from '../modules/BattleManager'
import { GameState } from '../schemas/GameState'
import { Projectile } from '../schemas/Projectile'
import { Mob } from '../schemas/Mob'

describe('char: ProjectileManager.handleEntityCollision', () => {
  let state: GameState
  let pm: ProjectileManager
  let battleManager: BattleManager

  const target = () =>
    new Mob({
      id: 'target',
      x: 0,
      y: 0,
      radius: 1,
      maxHealth: 100,
      pAtk: 10,
      attackRange: 5,
      atkWindDownTime: 1000,
      pDef: 0,
      mDef: 0,
      armor: 0,
      density: 1,
    })

  beforeEach(() => {
    state = new GameState('m', 'r')
    battleManager = new BattleManager('r', state)
    state.battleManager = battleManager
    pm = new ProjectileManager(state, new BattleModule(state), battleManager)
  })
  afterEach(() => {
    battleManager.cleanup()
    state.stopAI()
    jest.restoreAllMocks()
  })

  it('routes a hit through the BattleManager queue and records the target', () => {
    const spy = jest.spyOn(battleManager, 'addActionMessage')
    const t = target()
    const proj = new Projectile('p1', 0, 0, 10, 0, 'shooter', 5)
    pm.handleEntityCollision(proj, t)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(proj.hitTargets.has('target')).toBe(true)
  })

  it('non-piercing projectile sticks after a hit; piercing keeps flying', () => {
    const nonPiercing = new Projectile('p2', 0, 0, 10, 0, 'shooter', 5)
    pm.handleEntityCollision(nonPiercing, target())
    expect(nonPiercing.isStuck).toBe(true)

    const piercing = new Projectile('p3', 0, 0, 10, 0, 'shooter', 5)
    piercing.piercing = true
    pm.handleEntityCollision(piercing, target())
    expect(piercing.isStuck).toBe(false)
  })

  it('ignores a hit on the projectile owner', () => {
    const spy = jest.spyOn(battleManager, 'addActionMessage')
    const t = target()
    const proj = new Projectile('p4', 0, 0, 10, 0, 'target', 5)
    pm.handleEntityCollision(proj, t)
    expect(spy).not.toHaveBeenCalled()
  })
})
