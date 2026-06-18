import { createAttackStrategies } from '../config/attackStrategyFactory'
import { AttackStrategyConfig, AttackCharacteristicType } from '../config/mobTypesConfig'
import { MeleeAttackStrategy } from '../ai/strategies/MeleeAttackStrategy'
import { SpearThrowAttackStrategy } from '../ai/strategies/SpearThrowAttackStrategy'
import { DoubleAttackStrategy } from '../ai/strategies/DoubleAttackStrategy'
import { GameState } from '../schemas/GameState'

/**
 * createAttackStrategies maps mob attack-strategy config -> concrete strategy
 * instances. It was effectively untested (~16%); a silent mis-mapping here would
 * change combat behavior whenever a mob definition is edited. These tests pin the
 * id -> instance-type contract and the null-dependency guard.
 */
describe('createAttackStrategies', () => {
  const gameState = new GameState('map-test', 'room-1')
  // Factory only stores the reference on the strategy; a stub is sufficient.
  const projectileManager = { createMelee: () => {}, createSpear: () => {} } as any

  const projectileAttack = (windUp: number) => ({
    atkBaseDmg: 10,
    atkWindUpTime: windUp,
    atkCharacteristic: {
      type: AttackCharacteristicType.PROJECTILE as const,
      projectile: { speedUnitsPerSec: 10, projectileRadius: 1, atkRange: 10 },
    },
  })

  it('returns an empty list when dependencies are missing (null guard)', () => {
    const cfg: AttackStrategyConfig = { id: 'melee', attacks: [projectileAttack(0)] }
    expect(createAttackStrategies(cfg, 1, null, gameState)).toEqual([])
    expect(createAttackStrategies(cfg, 1, projectileManager, null)).toEqual([])
  })

  it('maps id "melee" to a MeleeAttackStrategy', () => {
    const cfg: AttackStrategyConfig = { id: 'melee', attacks: [projectileAttack(0)] }
    const strategies = createAttackStrategies(cfg, 1, projectileManager, gameState)
    expect(strategies).toHaveLength(1)
    expect(strategies[0]).toBeInstanceOf(MeleeAttackStrategy)
  })

  it('maps id "spear" to a SpearThrowAttackStrategy', () => {
    const cfg: AttackStrategyConfig = { id: 'spear', attacks: [projectileAttack(300)] }
    const strategies = createAttackStrategies(cfg, 1, projectileManager, gameState)
    expect(strategies).toHaveLength(1)
    expect(strategies[0]).toBeInstanceOf(SpearThrowAttackStrategy)
  })

  it('maps id "doubleAttack" to a single DoubleAttackStrategy carrying all attacks', () => {
    const cfg: AttackStrategyConfig = {
      id: 'doubleAttack',
      attacks: [projectileAttack(200), projectileAttack(300)],
    }
    const strategies = createAttackStrategies(cfg, 1, projectileManager, gameState)
    expect(strategies).toHaveLength(1)
    expect(strategies[0]).toBeInstanceOf(DoubleAttackStrategy)
  })

  it('default handler: instant attacks become melee, ranged become spear', () => {
    const cfg: AttackStrategyConfig = {
      id: 'customMix',
      attacks: [projectileAttack(0), projectileAttack(250)],
    }
    const strategies = createAttackStrategies(cfg, 1, projectileManager, gameState)
    expect(strategies).toHaveLength(2)
    expect(strategies[0]).toBeInstanceOf(MeleeAttackStrategy)
    expect(strategies[1]).toBeInstanceOf(SpearThrowAttackStrategy)
  })
})
