/**
 * End-to-end element threading (World Wisdom / F-017).
 *
 * Covers every server path that can carry an attack element into
 * DamageCalculator:
 *   1. BattleManager.createAttackMessage -> AttackActionPayload.element
 *   2. BattleModule.processAttack        -> DamageCalculator
 *   3. ProjectileCollisionResolver       -> both the BattleManager-queue path
 *                                           and the direct-damage fallback
 *   4. The two config sources: WeaponConfig.element and AttackDefinition.element
 *
 * Element effects are asserted against Mob targets only — Player and NPC never
 * seed a non-neutral element today, so they would always read 'neutral'.
 */

import { BattleManager } from '../modules/BattleManager'
import { BattleModule } from '../modules/BattleModule'
import type { AttackActionPayload } from '../modules/BattleActionMessage'
import { Player } from '../schemas/Player'
import { Mob } from '../schemas/Mob'
import { Projectile } from '../schemas/Projectile'
import { GameState } from '../schemas/GameState'
import { ProjectileCollisionResolver } from '../modules/projectile/ProjectileCollisionResolver'
import { DeflectionResolver } from '../modules/projectile/DeflectionResolver'
import { resolveWeaponBasicProjectileParams } from '../combat/attackDamage'
import { WEAPONS } from '../config/combat/weapons'
import { MeleeAttackStrategy } from '../ai/strategies/MeleeAttackStrategy'
import { SpearThrowAttackStrategy } from '../ai/strategies/SpearThrowAttackStrategy'
import { DoubleAttackStrategy } from '../ai/strategies/DoubleAttackStrategy'
import { PlayerCombatSystem } from '../systems/PlayerCombatSystem'
import { ProjectileManager } from '../modules/ProjectileManager'
import { AttackCharacteristicType, type AttackDefinition } from '../config/mobTypesConfig'

describe('createAttackMessage', () => {
  it('carries the attack element into the payload', () => {
    const msg = BattleManager.createAttackMessage({
      actorId: 'a',
      targetId: 'b',
      damage: 10,
      range: 2,
      element: 'fire',
    })
    expect((msg.actionPayload as AttackActionPayload).element).toBe('fire')
    expect(msg.actionKey).toBe('attack')
    expect(msg.targetId).toBe('b')
  })

  it('defaults to neutral when no element is supplied', () => {
    const msg = BattleManager.createAttackMessage({
      actorId: 'a',
      targetId: 'b',
      damage: 10,
      range: 2,
    })
    expect((msg.actionPayload as AttackActionPayload).element).toBe('neutral')
    // Unchanged defaults: melee attacks still skip the projectile bypass.
    expect((msg.actionPayload as AttackActionPayload).attackType).toBe('melee')
  })
})

describe('processAttack applies the payload element', () => {
  let gameState: GameState
  let battleModule: BattleModule
  let player: Player
  let mob: Mob

  // Same room/entity shape as src/tests/battle.test.ts.
  beforeEach(() => {
    gameState = new GameState('test-map', 'room-element')
    battleModule = new BattleModule(gameState)
    player = new Player('attacker-session', 'Attacker', 100, 100)
    mob = new Mob({
      id: 'water-mob',
      x: 105, // Close to player
      y: 100,
      attackRange: 10,
      pAtk: 20,
      maxHealth: 500,
      pDef: 0,
      armor: 0,
      element: 'water',
    })
    gameState.players.set(player.id, player)
    gameState.mobs.set(mob.id, mob)
  })

  afterEach(() => {
    gameState.stopAI()
  })

  const attackWith = (element: AttackActionPayload['element']): number => {
    const before = mob.currentHealth
    const event = battleModule.processAttack(player, mob, {
      damage: 100,
      range: 50,
      damageType: 'physical',
      element,
      attackType: 'projectile', // bypasses the range/cooldown gate, like a real hit
    })
    expect(event).not.toBeNull()
    return before - mob.currentHealth
  }

  it('halves damage when fire hits a water target', () => {
    const neutralDamage = attackWith('neutral')
    mob.currentHealth = mob.maxHealth
    const fireDamage = attackWith('fire')

    expect(neutralDamage).toBe(100)
    expect(fireDamage).toBe(neutralDamage / 2)
  })

  it('doubles damage when wind hits a water target', () => {
    expect(attackWith('wind')).toBe(200)
  })

  it('treats a missing payload element as neutral', () => {
    const before = mob.currentHealth
    battleModule.processAttack(player, mob, {
      damage: 100,
      range: 50,
      damageType: 'physical',
      attackType: 'projectile',
    })
    expect(before - mob.currentHealth).toBe(100)
  })
})

describe('ProjectileCollisionResolver carries projectile.element', () => {
  let gameState: GameState
  let battleModule: BattleModule
  let owner: Player
  let mob: Mob

  const makeProjectile = (element: Projectile['element']): Projectile => {
    const projectile = new Projectile('proj-1', 105, 100, 1, 0, owner.id, 100, 'physical')
    projectile.element = element
    return projectile
  }

  beforeEach(() => {
    gameState = new GameState('test-map', 'room-projectile')
    battleModule = new BattleModule(gameState)
    owner = new Player('owner-session', 'Owner', 100, 100)
    mob = new Mob({
      id: 'water-mob',
      x: 105,
      y: 100,
      maxHealth: 500,
      pDef: 0,
      armor: 0,
      element: 'water',
    })
    gameState.players.set(owner.id, owner)
    gameState.mobs.set(mob.id, mob)
    // Projectiles cross team lines only when teams differ; owner keeps the
    // player default team, mob keeps BLACK_WING.
  })

  afterEach(() => {
    gameState.stopAI()
  })

  it('applies the element on the direct-damage fallback path (no BattleManager)', () => {
    const resolver = new ProjectileCollisionResolver(
      gameState,
      battleModule,
      undefined,
      new DeflectionResolver(gameState)
    )

    resolver.handleEntityCollision(makeProjectile('fire'), mob)
    expect(mob.maxHealth - mob.currentHealth).toBe(50) // 100 base, fire vs water = x0.5
  })

  it('applies the element on the BattleManager queue path', async () => {
    const battleManager = new BattleManager('room-projectile', gameState)
    try {
      const resolver = new ProjectileCollisionResolver(
        gameState,
        battleModule,
        battleManager,
        new DeflectionResolver(gameState)
      )

      resolver.handleEntityCollision(makeProjectile('wind'), mob)
      await battleManager.processActionMessages()

      // 100 base, wind vs water = x2
      expect(mob.maxHealth - mob.currentHealth).toBe(200)
    } finally {
      battleManager.cleanup()
    }
  })
})

describe('element sources', () => {
  let gameState: GameState
  let projectileManager: ProjectileManager

  beforeEach(() => {
    gameState = new GameState('test-map', 'room-strategy')
    projectileManager = new ProjectileManager(gameState, new BattleModule(gameState))
  })

  afterEach(() => {
    gameState.stopAI()
  })

  const spawnedElements = (): string[] => [...gameState.projectiles.values()].map(p => p.element)

  /** No shipped weapon is elemental yet, so drive the lookup with a temporary entry. */
  const withElementalWeapon = (element: 'fire', run: (weaponId: string) => void): void => {
    const id = '__test_elemental_weapon'
    WEAPONS[id] = { ...WEAPONS.basic_sword, id, element }
    try {
      run(id)
    } finally {
      delete WEAPONS[id]
    }
  }

  const attackDef = (over: Partial<AttackDefinition> = {}): AttackDefinition => ({
    atkBaseDmg: 10,
    atkWindUpTime: 0,
    atkCharacteristic: {
      type: AttackCharacteristicType.AREA,
      area: { areaRadius: 2, atkRange: 2 },
    },
    ...over,
  })

  it('resolves the equipped weapon element for player basic attacks', () => {
    const player = new Player('weapon-session', 'Armed', 0, 0)
    player.equippedWeaponId = 'basic_sword'
    expect(resolveWeaponBasicProjectileParams(player).element).toBe('neutral')

    withElementalWeapon('fire', weaponId => {
      player.equippedWeaponId = weaponId
      expect(resolveWeaponBasicProjectileParams(player).element).toBe('fire')
    })
  })

  it('stamps the weapon element onto the projectile a player basic attack spawns', () => {
    const player = new Player('weapon-session', 'Armed', 0, 0)
    gameState.players.set(player.id, player)
    const combat = new PlayerCombatSystem(player)
    const context = { roomId: gameState.roomId, projectileManager, gameState }

    player.equippedWeaponId = 'basic_sword'
    expect(combat.executeAttack(context)).toBe(true)
    expect(spawnedElements()).toEqual(['neutral'])

    gameState.projectiles.clear()
    withElementalWeapon('fire', weaponId => {
      player.equippedWeaponId = weaponId
      expect(combat.executeAttack(context)).toBe(true)
      expect(spawnedElements()).toEqual(['fire'])
    })
  })

  it('stamps the executing AttackDefinition element onto a mob melee projectile', () => {
    const attacker = new Mob({ id: 'holy-mob', x: 0, y: 0, pAtk: 10 })
    const target = new Mob({ id: 'victim', x: 1, y: 0 })
    gameState.mobs.set(attacker.id, attacker)
    gameState.mobs.set(target.id, target)

    const strategy = new MeleeAttackStrategy(projectileManager, gameState, {
      attack: attackDef({ element: 'holy' }),
    })

    expect(strategy.execute(attacker, target, gameState.roomId)).toBe(true)
    expect(spawnedElements()).toEqual(['holy'])
  })

  it('defaults a mob melee projectile to neutral when the AttackDefinition has no element', () => {
    const attacker = new Mob({ id: 'plain-mob', x: 0, y: 0, pAtk: 10 })
    const target = new Mob({ id: 'victim', x: 1, y: 0 })
    gameState.mobs.set(attacker.id, attacker)
    gameState.mobs.set(target.id, target)

    const strategy = new MeleeAttackStrategy(projectileManager, gameState, { attack: attackDef() })

    expect(strategy.execute(attacker, target, gameState.roomId)).toBe(true)
    expect(spawnedElements()).toEqual(['neutral'])
  })

  it('stamps the AttackDefinition element onto a spear-throw projectile', () => {
    const attacker = new Mob({ id: 'void-mob', x: 0, y: 0, pAtk: 10 })
    const target = new Mob({ id: 'victim', x: 5, y: 0 })
    gameState.mobs.set(attacker.id, attacker)
    gameState.mobs.set(target.id, target)

    const strategy = new SpearThrowAttackStrategy(projectileManager, gameState, {
      attack: attackDef({ element: 'void' }),
    })

    expect(strategy.execute(attacker, target, gameState.roomId)).toBe(true)
    expect(spawnedElements()).toEqual(['void'])
  })

  it('stamps the per-attack element on each projectile of a double attack', () => {
    const attacker = new Mob({ id: 'combo-mob', x: 0, y: 0, pAtk: 10 })
    const target = new Mob({ id: 'victim', x: 1, y: 0 })
    gameState.mobs.set(attacker.id, attacker)
    gameState.mobs.set(target.id, target)

    const projectileAttack = (element?: AttackDefinition['element']): AttackDefinition =>
      attackDef({
        element,
        atkCharacteristic: {
          type: AttackCharacteristicType.PROJECTILE,
          projectile: { speedUnitsPerSec: 20, projectileRadius: 0.5, atkRange: 10 },
        },
      })

    const strategy = new DoubleAttackStrategy(projectileManager, gameState, [
      projectileAttack('earth'),
      projectileAttack(),
    ])

    strategy.performAttack(attacker, target, projectileAttack('earth'))
    strategy.performAttack(attacker, target, projectileAttack())

    expect(spawnedElements()).toEqual(['earth', 'neutral'])
  })
})
