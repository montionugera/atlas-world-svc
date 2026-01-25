
import { DoubleAttackStrategy } from '../ai/strategies/DoubleAttackStrategy'
import { ProjectileManager } from '../modules/ProjectileManager'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { AttackDefinition, AttackCharacteristicType } from '../config/mobTypesConfig'
import { MOB_STATS } from '../config/combatConfig'

describe('Projectile Type Verification', () => {
    let gameState: GameState
    let projectileManager: ProjectileManager
    let mob: Mob
    let player: Player
    let strategy: DoubleAttackStrategy

    beforeEach(() => {
        gameState = new GameState('test-map', 'test-room')
        const battleModule = {
            calculateDamage: jest.fn().mockReturnValue(10),
            applyDamage: jest.fn().mockReturnValue(false)
        } as any
        projectileManager = new ProjectileManager(gameState, battleModule)
        
        mob = new Mob({ id: 'mob-1', x: 0, y: 0 })
        player = new Player('player-1', 'Test Player', 10, 0)
        gameState.players.set(player.id, player)
        gameState.mobs.set(mob.id, mob)

        const attackDefs: AttackDefinition[] = [
            {
                atkBaseDmg: 10,
                atkWindUpTime: 0,
                atkCharacteristic: {
                    type: AttackCharacteristicType.PROJECTILE,
                    projectile: {
                        speedUnitsPerSec: 10,
                        projectileRadius: 1,
                        atkRange: 20,
                        projectileType: 'melee'
                    }
                }
            },
            {
                atkBaseDmg: 20,
                atkWindUpTime: 0,
                atkCharacteristic: {
                    type: AttackCharacteristicType.PROJECTILE,
                    projectile: {
                        speedUnitsPerSec: 20,
                        projectileRadius: 1,
                        atkRange: 30,
                        projectileType: 'spear'
                    }
                }
            }
        ]
        
        strategy = new DoubleAttackStrategy(projectileManager, gameState, attackDefs)
    })

    test('should create melee projectile with type "melee"', () => {
        strategy.performAttack(mob, player, strategy['attacks'][0])
        
        expect(gameState.projectiles.size).toBe(1)
        const projectile = Array.from(gameState.projectiles.values())[0]
        expect(projectile.type).toBe('melee')
    })

    test('should create spear projectile with type "spear"', () => {
        strategy.performAttack(mob, player, strategy['attacks'][1])
        
        expect(gameState.projectiles.size).toBe(1)
        const projectile = Array.from(gameState.projectiles.values())[0]
        expect(projectile.type).toBe('spear')
        expect(projectile.damage).toBe(20)
    })
})
