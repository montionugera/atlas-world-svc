import { describe, expect, test, jest, beforeEach } from '@jest/globals'
import { TrapManager } from '../modules/TrapManager'
import { BattleModule } from '../modules/BattleModule'
import { GameState } from '../schemas/GameState'
import { Player } from '../schemas/Player'
import { Trap } from '../schemas/Trap'
import { Mob } from '../schemas/Mob'

describe('Trap System and Status Effects', () => {
    let gameState: GameState
    let battleModule: BattleModule
    let trapManager: TrapManager
    let player: Player
    let mob: Mob

    beforeEach(() => {
        gameState = new GameState('test-map', 'test-room')
        battleModule = new BattleModule(gameState)
        trapManager = new TrapManager(gameState, battleModule)
        
        player = new Player('p1', 'Player 1', 100, 100)
        gameState.players.set('p1', player)
        
        mob = new Mob({ id: 'm1', x: 200, y: 200 })
        gameState.mobs.set('m1', mob)
    })

    test('should create and arm a trap correctly', () => {
        // Create trap
        const trap = trapManager.createTrap(50, 50, 'p1', 'damage', 20, 5, 1000)
        gameState.traps.set(trap.id, trap)

        expect(trap).toBeDefined()
        expect(trap.isArmed).toBe(false)
        expect(trap.effectType).toBe('damage')

        // Mock time explicitly
        const startTime = Date.now()
        jest.spyOn(Date, 'now').mockReturnValue(startTime + 500)
        
        // Update - should not arm yet (500ms < 1000ms)
        trapManager.update(gameState.traps)
        expect(trap.isArmed).toBe(false)

        // Advance time
        jest.spyOn(Date, 'now').mockReturnValue(startTime + 1500)
        
        // Update - should arm now
        trapManager.update(gameState.traps)
        expect(trap.isArmed).toBe(true)
    })

    test('should trigger damage trap on player contact', () => {
        const trap = trapManager.createTrap(100, 100, 'm1', 'damage', 50, 5, 0) // 0 delay
        gameState.traps.set(trap.id, trap)
        trap.isArmed = true // Force arm
        
        const initialHealth = player.currentHealth
        
        // Update - player is at 100,100, trap is at 100,100 -> Trigger
        trapManager.update(gameState.traps)
        
        // Trap should be removed
        expect(gameState.traps.get(trap.id)).toBeUndefined()
        
        // Player should take damage (50) - defense (0)
        expect(player.currentHealth).toBe(initialHealth - 50)
    })

    test('should trigger freeze trap and apply status effect', () => {
        const duration = 2000
        const trap = trapManager.createTrap(200, 200, 'p1', 'freeze', duration, 5, 0)
        gameState.traps.set(trap.id, trap)
        trap.isArmed = true
        
        // Mob is at 200,200
        expect(mob.isFrozen).toBe(false)
        
        trapManager.update(gameState.traps)
        
        expect(mob.isFrozen).toBe(true)
        expect(mob.freezeDuration).toBeGreaterThanOrEqual(duration)
        expect(gameState.traps.get(trap.id)).toBeUndefined()
    })

    test('isFrozen status should block movement and actions', () => {
        // Freeze player
        battleModule.applyStatusEffect(player, 'freeze', 1000)
        expect(player.isFrozen).toBe(true)

        // Try to set velocity
        player.vx = 10
        player.vy = 10
        
        // Update player
        player.update(16, gameState)
        
        // Should be reset to not moving
        expect(player.isMoving).toBe(false)
        // Note: We don't strictly zero velocity in WorldLife.update (it happens in input processing), 
        // but isMoving flag is forced false.
        // Let's check canAttack
        expect(player.canAttack()).toBe(false)
    })

    test('status effect should expire', () => {
         battleModule.applyStatusEffect(player, 'stun', 100) // 100ms
         expect(player.isStunned).toBe(true)
         
         // Update with 50ms delta
         player.update(50, gameState)
         expect(player.isStunned).toBe(true)
         expect(player.stunDuration).toBeLessThanOrEqual(50)
         
         // Update with another 60ms delta
         player.update(60, gameState)
         expect(player.isStunned).toBe(false)
    })

    test('should trigger with edge-to-edge collision', () => {
        // Trap at 0,0 with radius 2
        const trap = trapManager.createTrap(0, 0, 'p1', 'damage', 10, 2, 0)
        gameState.traps.set(trap.id, trap)
        trap.isArmed = true
        
        // Mob radius is 4 (default)
        // Position mob at x=5, y=0. Distance = 5.
        // Trap Radius (2) + Mob Radius (4) = 6.
        // Distance (5) <= 6 -> Should trigger
        
        mob.x = 5
        mob.y = 0
        mob.radius = 4
        
        trapManager.update(gameState.traps)
        
        // Trap should be triggered and removed
        expect(gameState.traps.get(trap.id)).toBeUndefined()
    })
})
