import { describe, expect, test, beforeEach } from 'bun:test'
import { Mob } from '../schemas/Mob'
import { BattleStatus } from '../schemas/BattleStatus'
import { BattleModule } from '../modules/BattleModule'
import { GameState } from '../schemas/GameState'
import { ZoneEffectManager } from '../modules/ZoneEffectManager'
import { AttackStrategy } from '../ai/strategies/AttackStrategy'
import { Player } from '../schemas/Player'
import { AIWorldInterface } from '../ai/AIWorldInterface'

// Mock Strategy
class MockStrategy implements AttackStrategy {
    name: string = 'mock'
    castTime: number = 1000
    
    constructor() {} 
    
    getCastTime(): number { return this.castTime }
    
    canExecute(mob: any, target: any): boolean { return true }
    
    execute(mob: any, target: any, roomId: string): boolean { return true }
    
    attemptExecute(mob: Mob, target: Player, roomId: string) {
        return {
            canExecute: true,
            needsCasting: true,
            executed: false
        }
    }
}

describe('Mob Status Effects', () => {
    let mob: Mob
    let player: Player
    let gameState: GameState
    let battleModule: BattleModule
    let zoneEffectManager: ZoneEffectManager

    beforeEach(() => {
        gameState = new GameState()
        battleModule = new BattleModule(gameState)
        zoneEffectManager = new ZoneEffectManager(gameState, battleModule)
        
        mob = new Mob({ id: 'mob1', x: 0, y: 0, attackStrategies: [new MockStrategy()] })
        player = new Player('p1', 'Player 1', 10, 0) // Close enough to attack
        
        gameState.mobs.set(mob.id, mob)
        gameState.players.set(player.sessionId, player)
    })

    test('Stun should block movement (desiredVx zeroed via override)', () => {
        // Arrange: valid AI decision to move
        mob.desiredVx = 10
        mob.vx = 10
        
        // Act: Apply Stun
        battleModule.applyStatusEffect(mob, 'stun', 5000)
        
        // Run update (simulating game loop)
        mob.update(100) 
        
        // Assert
        expect(mob.isStunned).toBe(true)
        expect(mob.isMoving).toBe(false)
        expect(mob.vx).toBe(0)
        expect(mob.vy).toBe(0)
    })

    test('Stun should block attack initiation', () => {
        // Arrange
        mob.currentAttackTarget = player.id
        
        // Act: Apply Stun
        battleModule.applyStatusEffect(mob, 'stun', 5000)
        const result = mob.updateAttack(gameState.players, 'room1')
        
        // Assert
        expect(mob.isStunned).toBe(true)
        expect(result.attacked).toBe(false)
        expect(mob.canAttack()).toBe(false)
    })

    test('Stun should interrupt active casting (Mob internal)', () => {
        // Arrange: Start casting
        // We force casting state
        (mob as any).startCasting(new MockStrategy(), Date.now())
        expect(mob.isCasting).toBe(true)
        
        // Act: Apply Stun and Update
        battleModule.applyStatusEffect(mob, 'stun', 5000)
        mob.update(100)
        
        // Assert
        expect(mob.isCasting).toBe(false)
    })

    test('Stun should interrupt active ZoneEffect casting', () => {
        // Arrange: active zone effect casting
        // Create a zone with cast time
        const zone = zoneEffectManager.createZoneEffect(0,0, mob.id, 'skill1', [], 2, 2000, 1000)
        const zones = new Map()
        zones.set(zone.id, zone)
        
        // Check initial state
        expect((mob as any).isCasting).toBe(true) // Zone creation sets casting
        
        // Act: Apply Stun and Update Zone Manager
        battleModule.applyStatusEffect(mob, 'stun', 5000)
        zoneEffectManager.update(zones)
        
        // Assert
        expect(zones.has(zone.id)).toBe(false) // Should be removed/interrupted
        expect(mob.isCasting).toBe(false) // Should be cleared
    })
})
