import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { DoubleAttackStrategy } from '../ai/strategies/DoubleAttackStrategy'
import { ProjectileManager } from '../modules/ProjectileManager'
import { GameState } from '../schemas/GameState'
import { Projectile } from '../schemas/Projectile'
import { AttackDefinition, AttackCharacteristicType } from '../config/mobTypesConfig'
import { BattleStatus } from '../schemas/BattleStatus'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'

describe('Attack Queue System', () => {
    let mob: Mob
    let player: Player
    let gameState: GameState
    let projectileManager: ProjectileManager
    let doubleStrategy: DoubleAttackStrategy
    let currentPlayers: Map<string, any>

    beforeEach(() => {
        jest.useFakeTimers()
        gameState = new GameState("map-test", "room-1")
        projectileManager = {
            createMelee: jest.fn().mockImplementation(() => {
                const p = new Projectile('proj-1', 0, 0, 10, 0, mob.id, 10)
                return p
            }),
            createSpear: jest.fn().mockImplementation(() => {
                const p = new Projectile('proj-2', 0, 0, 10, 0, mob.id, 10)
                return p
            })
        } as any

        mob = new Mob({
            id: 'mob-1',
            x: 0, 
            y: 0,
            radius: 1,
            maxHealth: 100,
            attackDamage: 10,
            attackRange: 10,
            atkWindDownTime: 2000,
            defense: 0,
            armor: 0,
            density: 1
        });
        (mob as any).state = gameState

        player = new Player('p1', 'Player 1', 5, 5)
        player.sessionId = 'p1'
        gameState.players.set(player.sessionId, player)
        currentPlayers = gameState.players

        const attacks: AttackDefinition[] = [
            {
                atkBaseDmg: 10,
                atkRadius: 2,
                atkWindUpTime: 200, // 200ms cast
                atkCharacteristic: { type: AttackCharacteristicType.PROJECTILE, projectile: { speedUnitsPerSec: 10, projectileRadius: 1, atkRange: 10 } }
            },
            {
                atkBaseDmg: 20,
                atkRadius: 2,
                atkWindUpTime: 300, // 300ms delay/cast
                atkCharacteristic: { type: AttackCharacteristicType.PROJECTILE, projectile: { speedUnitsPerSec: 10, projectileRadius: 1, atkRange: 10 } }
            }
        ]

        doubleStrategy = new DoubleAttackStrategy(projectileManager, gameState, attacks)
        mob.attackStrategies.push(doubleStrategy)
        
        // Ensure Mob is in attack mode
        mob.currentBehavior = 'attack'
        mob.currentAttackTarget = player.sessionId
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    test('should enqueue attacks and manage casting state correctly', () => {
        // 1. Initial State
        expect(mob.attackQueue.length).toBe(0)
        expect(mob.isCasting).toBe(false)
        
        // 2. Execute Strategy (Enqueues items)
        const result = doubleStrategy.attemptExecute(mob, player, 'room-1')
        
        expect(result.executed).toBe(true)
        expect(mob.attackQueue.length).toBe(2)
        expect(mob.isCasting).toBe(true) 
        
        // Queue Item 1 execution time: Now + 200
        const now = Date.now()
        expect(mob.attackQueue[0].executionTime).toBe(now + 200)

        // 3. Advance time by 100ms
        jest.setSystemTime(now + 100)
        
        mob.updateAttack(currentPlayers, 'room-1')
        expect(mob.attackQueue.length).toBe(2)
        expect(mob.isCasting).toBe(true)
        
        // 4. Advance time by 100ms (Total 200ms)
        jest.setSystemTime(now + 200)
        console.log(`Debug Time: ${Date.now()}, Next Execution: ${mob.attackQueue[0]?.executionTime}`)
        mob.updateAttack(currentPlayers, 'room-1')
        
        expect(mob.attackQueue.length).toBe(1) // Dequeued
        expect(projectileManager.createSpear).toHaveBeenCalledTimes(1)
        expect(mob.isCasting).toBe(true)
        // 5. Advance time by 299ms (Total 499ms)
        jest.setSystemTime(now + 499)
        mob.updateAttack(currentPlayers, 'room-1')
        expect(mob.isCasting).toBe(true)
        expect(mob.attackQueue.length).toBe(1)
        
        // 6. Advance time by 1ms (Total 500ms)
        jest.setSystemTime(now + 500)
        mob.updateAttack(currentPlayers, 'room-1')
        
        expect(mob.attackQueue.length).toBe(0)
        expect(projectileManager.createSpear).toHaveBeenCalledTimes(2)
        expect(mob.isCasting).toBe(false)
        expect(mob.attackQueue.length).toBe(0)
        expect(projectileManager.createSpear).toHaveBeenCalledTimes(2)
        expect(mob.isCasting).toBe(false)
    })

    test('should clear attack queue when mob is stunned', () => {
        const now = Date.now()
        // 1. Start the attack
        mob.updateAttack(currentPlayers, 'room-1')
        expect(mob.attackQueue.length).toBe(2)
        expect(mob.isCasting).toBe(true)

        // 2. Advance time partially (e.g. 100ms)
        jest.setSystemTime(now + 100)
        mob.updateAttack(currentPlayers, 'room-1')

        // 3. Apply Stun
        // mob.isStunned is a getter based on battleStatuses map
        mob.battleStatuses.set('stun', new BattleStatus('stun-1', 'stun', 2000, 'player-1')) // Add stun status
        
        // Allow Mob.update to process the stun logic (which handles isStunned check)
        // note: we need to test Mob.update() not just Mob.updateAttack() because the stun check is high level
        mob.update(16) 

        expect(mob.isCasting).toBe(false)

        // 4. Advance time past execution time (Total 200ms+)
        jest.setSystemTime(now + 300)
        
        // 5. Remove Stun
        mob.battleStatuses.delete('stun')
        mob.update(16) // Should resume
        
        // EXPECTATION: Queue should be empty or cleared. 
        // Currently, without the fix, it will probably still have the item and fire it immediately.
        // We assert the DESIRED behavior here (that it should NOT fire).
        expect(projectileManager.createSpear).not.toHaveBeenCalled()
        expect(mob.attackQueue.length).toBe(0)
    })

    test('should update attackDelay based on attack definition cooldown', () => {
        const now = Date.now()
        // Override mock implementation for this test
        const attackDef: AttackDefinition = {
            atkBaseDmg: 10,
            atkRadius: 2,
            atkWindUpTime: 0,
            atkCharacteristic: { type: AttackCharacteristicType.PROJECTILE, projectile: { speedUnitsPerSec: 10, projectileRadius: 1, atkRange: 10 } }
        }
        // Create an attack with specific cooldown
        const cooldownAttack = { ...attackDef, cooldown: 500 }
        
        // Mock Strategy
        const strategy = {
            id: 'test-strategy',
            name: 'test-strategy',
            attacks: [cooldownAttack], 
            getCastTime: () => 0,
            execute: jest.fn().mockReturnValue(true),
            performAttack: jest.fn()
        } as unknown as AttackStrategy

        mob.baseWindDownTime = 1000
        mob.attackDelay = 1000

        // Enqueue and process
        mob.enqueueAttacks(strategy, 'p1', [cooldownAttack], now)
        
        // Advance time to execute (cast time is 1000ms from setup)
        jest.setSystemTime(now + 1000)
        
        mob.update(16, gameState) // Should process queue

        expect(mob.attackQueue.length).toBe(0)
        // Check if attackDelay was updated
        expect(mob.attackDelay).toBe(500)

        // Reset and test reset behavior
        const defaultAttack = { ...attackDef, cooldown: undefined } // Explicitly undefined
        mob.enqueueAttacks(strategy, 'p1', [defaultAttack], Date.now())
        
        jest.setSystemTime(Date.now() + 1000)
        mob.update(16, gameState)
        
        // Should reset to base
        expect(mob.attackDelay).toBe(1000)
    })


})
