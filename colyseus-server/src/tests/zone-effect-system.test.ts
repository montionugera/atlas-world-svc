import { describe, expect, test, jest, beforeEach } from '@jest/globals'
import { ZoneEffectManager } from '../modules/ZoneEffectManager'
import { BattleModule } from '../modules/BattleModule'
import { GameState } from '../schemas/GameState'
import { Player } from '../schemas/Player'
import { ZoneEffect } from '../schemas/ZoneEffect'
import { Mob } from '../schemas/Mob'

describe('Zone Effect System', () => {
    let gameState: GameState
    let battleModule: BattleModule
    let zoneManager: ZoneEffectManager
    let player: Player
    let mob: Mob

    beforeEach(() => {
        gameState = new GameState('test-map', 'test-room')
        battleModule = new BattleModule(gameState)
        zoneManager = new ZoneEffectManager(gameState, battleModule)
        
        player = new Player('p1', 'Player 1', 100, 100)
        gameState.players.set('p1', player)
        
        mob = new Mob({ id: 'm1', x: 200, y: 200 })
        gameState.mobs.set('m1', mob)
    })

    test('should create and cast zone effect correctly', () => {
        // Create zone: 1s cast, 5s duration, 1s tick
        const zone = zoneManager.createZoneEffect(50, 50, 'p1', 'test_skill', [{type: 'damage', value: 20}], 5, 1000, 5000, 1000)
        gameState.zoneEffects.set(zone.id, zone)

        expect(zone).toBeDefined()
        expect(zone.isActive).toBe(false)
        expect(zone.effects.length).toBeGreaterThan(0)
        expect(zone.effects[0].type).toBe('damage')

        // Mock time
        const startTime = Date.now()
        jest.spyOn(Date, 'now').mockReturnValue(startTime + 500)
        
        // Update - should not activate yet
        zoneManager.update(gameState.zoneEffects)
        expect(zone.isActive).toBe(false)

        // Advance time past cast time
        jest.spyOn(Date, 'now').mockReturnValue(startTime + 1500)
        
        // Update - should activate now
        zoneManager.update(gameState.zoneEffects)
        expect(zone.isActive).toBe(true)
        expect(zone.activatedAt).toBe(startTime + 1500)
    })

    test('should apply ticking damage', () => {
        // Create an ACTIVE zone directly
        const zone = zoneManager.createZoneEffect(100, 100, 'm1', 'test_skill', [{type: 'damage', value: 10}], 5, 0, 5000, 1000)
        zone.isActive = true 
        zone.activatedAt = Date.now()
        // lastTickTime defaults to 0, so first update (if now > 1000) will proc.
        zone.lastTickTime = Date.now() - 1000 // Ready to tick

        gameState.zoneEffects.set(zone.id, zone)
        
        const initialHealth = player.currentHealth
        
        // Player at 100,100
        
        // Update - should tick
        zoneManager.update(gameState.zoneEffects)
        
        // Player should take damage
        expect(player.currentHealth).toBe(initialHealth - 10)
        
        // Zone should NOT be removed (it has duration)
        expect(gameState.zoneEffects.get(zone.id)).toBeDefined()
        
        // Advance time < tickRate (e.g., +500ms)
        const nextTime = Date.now() + 500
        jest.spyOn(Date, 'now').mockReturnValue(nextTime)
        
        // Update - should NOT tick
        const hpAfterFirstTick = player.currentHealth
        zoneManager.update(gameState.zoneEffects)
        expect(player.currentHealth).toBe(hpAfterFirstTick)
    })

    test('should expire after duration', () => {
        const zone = zoneManager.createZoneEffect(50, 50, 'p1', 'test_skill', [{type: 'damage', value: 10}], 5, 0, 2000, 1000)
        zone.isActive = true
        zone.activatedAt = Date.now()
        gameState.zoneEffects.set(zone.id, zone)
        
        // Advance time > duration
        jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2500)
        
        zoneManager.update(gameState.zoneEffects)
        
        // Should be removed
        expect(gameState.zoneEffects.get(zone.id)).toBeUndefined()
    })

    test('should trigger with edge-to-edge collision (from previous refactor)', () => {
        const zone = zoneManager.createZoneEffect(0, 0, 'p1', 'test_skill', [{type: 'damage', value: 10}], 2, 0, 5000, 1000)
        zone.isActive = true
        zone.activatedAt = Date.now()
        zone.lastTickTime = Date.now() - 1000 // Ready
        gameState.zoneEffects.set(zone.id, zone)
        
        // Mob radius 4. Zone radius 2. Distance 5.
        // 5 <= 2 + 4. Should hit.
        
        mob.x = 5
        mob.y = 0
        mob.radius = 4
        
        zoneManager.update(gameState.zoneEffects)
        
        // Mob should be hit
        expect(mob.currentHealth).toBeLessThan(100)
    })

    test('should apply status effect AND damage simultaneously', () => {
        const zone = zoneManager.createZoneEffect(0, 0, 'p1', 'test_skill', [
            {type: 'damage', value: 10},
            {type: 'freeze', value: 2000, chance: 1.0}
        ], 2, 0, 5000, 1000)
        
        zone.isActive = true
        zone.activatedAt = Date.now()
        zone.lastTickTime = Date.now() - 1000 // Ready
        gameState.zoneEffects.set(zone.id, zone)
        
        mob.x = 0
        mob.y = 0
        
        const initialHp = mob.currentHealth
        
        zoneManager.update(gameState.zoneEffects)
        
        // Damage check
        expect(mob.currentHealth).toBe(initialHp - 10)
        
        // Status check
        expect(mob.isFrozen).toBe(true)
    })

    test('should apply BURN DOT effect correctly', () => {
        // Create Burn Zone: 10 dmg per tick, 100 duration? No, 1000 interval. 
        // usage: {type: 'burn', value: 5 (dmg), duration: 5000, interval: 1000}
        const zone = zoneManager.createZoneEffect(0, 0, 'p1', 'test_skill', [
            {type: 'burn', value: 5, duration: 3000, interval: 1000}
        ], 2, 0, 5000, 1000)
        
        zone.isActive = true
        zone.activatedAt = Date.now()
        zone.lastTickTime = Date.now() - 1000 // Ready
        gameState.zoneEffects.set(zone.id, zone)
        
        mob.x = 0
        mob.y = 0
        const initialHp = mob.currentHealth
        
        // 1. First Tick (Zone applies status)
        zoneManager.update(gameState.zoneEffects)
        
        // Status should be applied, but no damage YET (ticks happen on interval)
        const burnStatus = mob.battleStatuses.get('burn')
        expect(burnStatus).toBeDefined()
        expect(burnStatus?.value).toBe(5)
        expect(burnStatus?.interval).toBe(1000)
        
        // Advance time by 500ms (no tick yet)
        const time1 = Date.now() + 500
        jest.spyOn(Date, 'now').mockReturnValue(time1)
        
        // Update battle state (WorldLife updates usually handle this via BattleModule)
        // Since we refactored WorldLife to rely on BattleModule, we must ensure it's called.
        // In this test env, we manually call battleModule.updateCombatState(mob, 500)
        battleModule.updateCombatState(mob, 500)
        
        expect(mob.currentHealth).toBe(initialHp) // No damage yet
        
        // Advance time by another 600ms (Total 1100ms > 1000ms interval)
        const time2 = time1 + 600
        jest.spyOn(Date, 'now').mockReturnValue(time2)
        
        battleModule.updateCombatState(mob, 600)
        
        // Should have taken damage: 1 tick * 5 dmg
        expect(mob.currentHealth).toBe(initialHp - 5)
        
        // Advance another 1000ms
        const time3 = time2 + 1000
        jest.spyOn(Date, 'now').mockReturnValue(time3)
        battleModule.updateCombatState(mob, 1000)
        expect(mob.currentHealth).toBe(initialHp - 10)
    })

    test('should prevent double damage from SAME event ID', () => {
        const mobDp = new Mob({ id: 'mdp', x: 0, y: 0 })
        mobDp.currentHealth = 100
        
        // Apply damage with ID "test-event-1"
        const result1 = battleModule.applyDamage(mobDp, 10, { eventId: 'test-event-1' })
        expect(mobDp.currentHealth).toBe(90)
        
        // Apply damage AGAIN with SAME ID
        const result2 = battleModule.applyDamage(mobDp, 10, { eventId: 'test-event-1' })
        expect(mobDp.currentHealth).toBe(90) // Should not change
        expect(result2).toBe(false)
    })

    test('should allow damage from DIFFERENT event IDs simultaneously', () => {
        const mobCombo = new Mob({ id: 'mcombo', x: 0, y: 0 })
        mobCombo.currentHealth = 100
        
        // Apply damage with ID "hit-1"
        battleModule.applyDamage(mobCombo, 10, { eventId: 'hit-1' })
        expect(mobCombo.currentHealth).toBe(90)
        
        // Apply damage with ID "hit-2" IMMEDIATELY (no wait)
        battleModule.applyDamage(mobCombo, 10, { eventId: 'hit-2' })
        expect(mobCombo.currentHealth).toBe(80) // Should reduce again
    })
    test('should apply SLOW effect when Frozen', () => {
        // Freeze the mob
        battleModule.applyStatusEffect(mob, 'freeze', 1000)
        
        expect(mob.isFrozen).toBe(true)
        expect(mob.getSpeedMultiplier()).toBe(0.2) // 80% reduction
        
        // Ensure isMoving is NOT forced to false (unless vx/vy are 0)
        mob.vx = 10
        mob.vy = 0
        mob.update(16) // update loop
        expect(mob.isMoving).toBe(true) // Should be moving
        
        // Advance time to expire freeze
        jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1500)
        mob.update(16) // update loop (cleans up status)
        
        expect(mob.isFrozen).toBe(false)
        expect(mob.getSpeedMultiplier()).toBe(1.0) // Back to normal
    })
})
