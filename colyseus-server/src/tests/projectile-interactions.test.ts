import { Projectile } from '../schemas/Projectile'
import { ProjectileManager } from '../modules/ProjectileManager'
import { GameState } from '../schemas/GameState'
import { Player } from '../schemas/Player'
import { BattleModule } from '../modules/BattleModule'
import { WEAPON_TYPES } from '../config/combatConfig'

describe('Configuration-Driven Projectile Interactions', () => {
  let gameState: GameState
  let battleModule: BattleModule
  let projectileManager: ProjectileManager
  let player1: Player
  let player2: Player

  beforeEach(() => {
    gameState = new GameState('test-map', 'test-room')
    battleModule = new BattleModule(gameState)
    projectileManager = new ProjectileManager(gameState, battleModule)

    player1 = new Player('player-1', 'P1', 10, 10)
    player2 = new Player('player-2', 'P2', 30, 10)
    
    player1.teamId = 'team-1'
    player2.teamId = 'team-2'
    
    gameState.players.set(player1.id, player1)
    gameState.players.set(player2.id, player2)
  })

  afterEach(() => {
    gameState.stopAI()
  })

  test('smallMeelee deflecting arrow: preserves speed; damage uses deflectPowerMultiplier', () => {
    player1.equipWeapon('dagger')

    const swing = new Projectile('swing-1', 10, 10, 0, 0, player1.id, 10, 'physical', WEAPON_TYPES.SMALL_MELEE, 10)
    gameState.projectiles.set(swing.id, swing)

    const arrow = new Projectile('arrow-1', 12, 10, -20, 0, player2.id, 10, 'physical', WEAPON_TYPES.ARROW, 10)
    gameState.projectiles.set(arrow.id, arrow)

    player1.isAttacking = true
    player1.heading = 0

    const deflected = projectileManager.checkDeflection(arrow, player1)

    expect(deflected).toBe(true)

    expect(arrow.vx).toBeGreaterThan(0)
    expect(Math.hypot(arrow.vx, arrow.vy)).toBeCloseTo(20, 1)
    expect(arrow.damage).toBe(1) // floor(10 * 0.3 * 0.5)
  })

  test('largeMeelee hit by magicSpear: physical clash stops dead, no bounce', () => {
    // P1 swings largeMeelee
    const swing = new Projectile('swing-2', 10, 10, 10, 0, player1.id, 10, 'physical', WEAPON_TYPES.LARGE_MELEE, 10)
    gameState.projectiles.set(swing.id, swing)
    
    // P2 shoots magicSpear
    const magicSpear = new Projectile('magic-1', 11, 10, -10, 0, player2.id, 10, 'magical', WEAPON_TYPES.MAGIC_SPEAR, 10)
    gameState.projectiles.set(magicSpear.id, magicSpear)
    
    // Simulate game physics engine attempting a collision
    projectileManager.handleProjectileCollision(swing, magicSpear)
    
    // magicSpear cannot be deflected. Thus, handleProjectileCollision should route to CLASH.
    expect(swing.isStuck).toBe(true)
    expect(magicSpear.isStuck).toBe(true)
    expect(swing.hitTargets.has('clash')).toBe(true)
    expect(magicSpear.hitTargets.has('clash')).toBe(true)
  })
})
