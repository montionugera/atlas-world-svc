
import { Mob } from '../schemas/Mob'
import { Player } from '../schemas/Player'
import { GameState } from '../schemas/GameState'
import { SpearThrowAttackStrategy } from '../ai/strategies/SpearThrowAttackStrategy'
import { ProjectileManager } from '../modules/ProjectileManager'
import { BattleModule } from '../modules/BattleModule'

describe('Mob Casting Heading Behavior', () => {
  let gameState: GameState
  let battleModule: BattleModule
  let projectileManager: ProjectileManager
  let mob: Mob
  let player: Player

  beforeEach(() => {
    gameState = new GameState('map-01-sector-a', 'test-room')
    battleModule = new BattleModule(gameState)
    projectileManager = new ProjectileManager(gameState, battleModule)

    mob = new Mob({
        id: 'mob-caster',
        x: 100, 
        y: 100,
    // Using spear throw which has a cast time (default 500ms)
    attackStrategies: [new SpearThrowAttackStrategy(projectileManager, gameState)]
    })
    
    player = new Player('player-target', 'Target', 110, 100)
    gameState.players.set(player.id, player)
  })
  
  test('Mob should (currently) update heading during casting when target moves', () => {
    // 1. Setup attack
    mob.currentBehavior = 'attack'
    mob.currentAttackTarget = player.id
    // Force cooldown ready (performance.now() is used in WorldLife)
    mob.lastAttackTime = -999999 
    
    // 2. Initial update to start casting
    // Verify start condition
    expect(mob.isCasting).toBe(false)
    
    mob.update(16, gameState)
    
    // Should have started casting
    expect(mob.isCasting).toBe(true)
    
    // Initial heading should be towards (110, 100) -> angle 0
    const initialDx = player.x - mob.x
    const initialDy = player.y - mob.y
    const expectedInitialHeading = Math.atan2(initialDy, initialDx)
    expect(mob.heading).toBeCloseTo(expectedInitialHeading) // Should be 0
    
    // 3. Move target significantly
    player.x = 100
    player.y = 110 // Directly below, angle PI/2 (approx 1.57)
    
    // 4. Update mob again (still casting)
    mob.update(16, gameState)
    
    // Verify still casting
    expect(mob.isCasting).toBe(true)
    
    // Check heading
    const newDx = player.x - mob.x
    const newDy = player.y - mob.y
    const targetHeading = Math.atan2(newDy, newDx) // Approx 1.57 (PI/2)
    
    // Expected behavior: Mob rotates slowly towards target
    // Max rotation = limited speed * delta
    // limited speed = Math.PI * 0.1 = ~0.314 rad/sec
    // delta = 0.016 sec
    // max change ~= 0.005 rad
    
    // Should have moved from 0 towards 1.57, but only slightly
    expect(mob.heading).toBeGreaterThan(expectedInitialHeading)
    expect(mob.heading).toBeLessThan(targetHeading)
    
    // Verify exact-ish amount
    // Allow small margin for floating point
    // Note: Mob default in Mob.ts line 43 is now Math.PI.
    const expectedHeadingChange = (mob.rotationSpeed * 0.1) * (16 / 1000)
    expect(mob.heading).toBeCloseTo(expectedInitialHeading + expectedHeadingChange, 4)
  })
})
