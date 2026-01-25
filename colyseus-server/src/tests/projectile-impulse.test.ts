import { Projectile } from '../schemas/Projectile'
import { ProjectileManager } from '../modules/ProjectileManager'
import { BattleManager } from '../modules/BattleManager'
import { GameState } from '../schemas/GameState'
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { BattleModule } from '../modules/BattleModule'
import { eventBus, RoomEventType } from '../events/EventBus'

describe('Projectile Impulse Integration', () => {
    let gameState: GameState
    let battleModule: BattleModule
    let projectileManager: ProjectileManager
    let mob: Mob
    let player: Player
    let eventSpy: jest.SpyInstance

    beforeEach(() => {
        gameState = new GameState('test-map', 'test-room')
        battleModule = new BattleModule(gameState)
        projectileManager = new ProjectileManager(gameState, battleModule)
        
        mob = new Mob({
            id: 'mob-1',
            x: 0,
            y: 0,
            radius: 4,
        })

        player = new Player('player-1', 'TestPlayer', 20, 0)
        gameState.players.set(player.id, player)
        gameState.mobs.set(mob.id, mob)
        
        // Mock event bus
        eventSpy = jest.spyOn(eventBus, 'emitRoomEvent').mockImplementation(() => {})
    })

    afterEach(() => {
        eventSpy.mockRestore()
    })

    test('should use projectile velocity for impulse direction', () => {
        // Create projectile moving right (Positive X)
        const projectile = new Projectile('proj-1', 10, 0, 100, 0, mob.id, 10)
        gameState.projectiles.set(projectile.id, projectile)
        
        // Setup player collision with the projectile
        projectileManager.handlePlayerCollision(projectile, player)
        
        // Verify event was emitted
        expect(eventSpy).toHaveBeenCalledWith(
            'test-room',
            RoomEventType.BATTLE_DAMAGE_PRODUCED,
            expect.objectContaining({
                attacker: expect.objectContaining({ id: mob.id }),
                taker: expect.objectContaining({ id: player.id }),
                impulse: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
            })
        )
        
        const callArgs = eventSpy.mock.calls.find(call => 
            call[1] === RoomEventType.BATTLE_DAMAGE_PRODUCED
        )
        const eventData = callArgs[2]
        
        // Impulse should be in direction of X (1, 0) * magnitude
        // Normalized velocity (100, 0) -> (1, 0)
        expect(eventData.impulse.x).toBeGreaterThan(0)
        expect(eventData.impulse.y).toBeCloseTo(0)
    })
    
     test('should use projectile velocity even if attacker direction disagrees', () => {
        // Attacker is at (0,0), Player is at (0, 20) (Up)
        // But Projectile comes from the side (Right, vx=100)
        
        player.x = 0
        player.y = 20
        
        // Projectile moving pure Right
        const weirdProjectile = new Projectile('proj-weird', 0, 20, 100, 0, mob.id, 10) 
        gameState.projectiles.set(weirdProjectile.id, weirdProjectile)
        
        projectileManager.handlePlayerCollision(weirdProjectile, player)
        
        const callArgs = eventSpy.mock.calls.find(call => 
            call[1] === RoomEventType.BATTLE_DAMAGE_PRODUCED
        )
        // Ensure event was found
        expect(callArgs).toBeDefined()
        const eventData = callArgs[2]
        
        // Impulse should follow projectile velocity (Right, Positive X)
        // Ignoring Attacker->Player direction (Up, Positive Y)
        expect(eventData.impulse.x).toBeGreaterThan(0)
        expect(eventData.impulse.y).toBeCloseTo(0)
    })
})

describe('Projectile Impulse Integration (Queue Path)', () => {
    let gameState: GameState
    let battleModule: BattleModule
    let projectileManager: ProjectileManager
    let battleManager: BattleManager
    let mob: Mob
    let player: Player
    let eventSpy: jest.SpyInstance

    beforeEach(() => {
        gameState = new GameState('test-map', 'test-room-queue')
        // We still need a dummy module for the fallback arg, though it won't be used for actions
        battleModule = new BattleModule(gameState)
        
        // Create REAL BattleManager (which creates its own internal BattleModule)
        battleManager = new BattleManager('test-room-queue', gameState)
        // Bypass throttle for testing
        ;(battleManager as any).lastProcessTime = 0 
        ;(battleManager as any).batchInterval = 0 
        
        projectileManager = new ProjectileManager(gameState, battleModule, battleManager)
        
        mob = new Mob({
            id: 'mob-1',
            x: 0,
            y: 0,
            radius: 4,
        })

        player = new Player('player-1', 'TestPlayer', 20, 0)
        gameState.players.set(player.id, player)
        gameState.mobs.set(mob.id, mob)
        
        eventSpy = jest.spyOn(eventBus, 'emitRoomEvent').mockImplementation(() => {})
    })

    afterEach(() => {
        eventSpy.mockRestore()
    })

    test('should pass impulse via action queue', async () => {
        const projectile = new Projectile('proj-q', 10, 0, 100, 0, mob.id, 10) // Moving Right
        gameState.projectiles.set(projectile.id, projectile)
        
        // 1. Queue collision
        projectileManager.handlePlayerCollision(projectile, player)
        
        // 2. Process Queue
        await battleManager.processActionMessages()
        
        // 3. Verify Event
        const callArgs = eventSpy.mock.calls.find(call => 
            call[1] === RoomEventType.BATTLE_DAMAGE_PRODUCED
        )
        expect(callArgs).toBeDefined()
        const eventData = callArgs[2]
        
        // Verify Impulse passed through queue
        // Velocity (100, 0) -> Impulse X positive
        expect(eventData.impulse.x).toBeGreaterThan(0)
        expect(eventData.impulse.y).toBeCloseTo(0)
    })
})
