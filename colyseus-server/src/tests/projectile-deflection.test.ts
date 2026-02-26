import { Projectile } from '../schemas/Projectile'
import { ProjectileManager } from '../modules/ProjectileManager'
import { BattleModule } from '../modules/BattleModule'
import { GameState } from '../schemas/GameState'
import { eventBus } from '../events/EventBus'

describe('Projectile Deflection System', () => {
    let gameState: GameState
    let battleModule: BattleModule
    let projectileManager: ProjectileManager

    beforeEach(() => {
        gameState = new GameState('test-map', 'test-room-deflect')
        battleModule = new BattleModule(gameState)
        projectileManager = new ProjectileManager(gameState, battleModule)
        
        // Mock event bus to avoid errors
        jest.spyOn(eventBus, 'emitRoomEvent').mockImplementation(() => {})
    })

    test('Equal Level: Both projectiles are destroyed', () => {
        const p1 = new Projectile('p1', 0, 0, 0, 0, 'owner1', 10)
        const p2 = new Projectile('p2', 0, 0, 0, 0, 'owner2', 10)

        projectileManager.handleProjectileCollision(p1, p2)

        // stuckAt > 0 implies destroyed/stopped
        expect(p1.stuckAt).toBeGreaterThan(0)
        expect(p2.stuckAt).toBeGreaterThan(0)
    })

    test('Different teams projectiles are destroyed', () => {
        const pStrong = new Projectile('strong', 0, 0, 0, 0, 'owner1', 10, 'spear', 100, 4, 1000, 'team1')
        const pWeak = new Projectile('weak', 0, 0, 0, 0, 'owner2', 10, 'spear', 100, 4, 1000, 'team2')

        projectileManager.handleProjectileCollision(pStrong, pWeak)

        // Both are destroyed because they clash
        expect(pStrong.stuckAt).toBeGreaterThan(0)
        expect(pWeak.stuckAt).toBeGreaterThan(0)
    })

    test('Same team projectiles ignore each other', () => {
        const pStrong = new Projectile('strong', 0, 0, 0, 0, 'owner1', 10, 'spear', 100, 4, 1000, 'team1')
        const pWeak = new Projectile('weak', 0, 0, 0, 0, 'owner2', 10, 'spear', 100, 4, 1000, 'team1')

        // Swap arguments
        projectileManager.handleProjectileCollision(pWeak, pStrong)

        expect(pStrong.stuckAt).toBe(0)
        expect(pWeak.stuckAt).toBe(0)
    })
    
    test('Dead projectile should not trigger collision again', () => {
        const pDead = new Projectile('dead', 0, 0, 0, 0, 'owner1', 10, 'spear', 100, 4, 1000, 'team1')
        pDead.stick() // Already dead
        pDead.hitTargets.add('clash') // Marks it as having already resolved collision
        
        const pLive = new Projectile('live', 0, 0, 0, 0, 'owner2', 10, 'spear', 100, 4, 1000, 'team2')
        
        projectileManager.handleProjectileCollision(pDead, pLive)
        
        // Live should remain live
        expect(pLive.stuckAt).toBe(0)
    })
})
