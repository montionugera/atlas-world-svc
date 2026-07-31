import { Player } from '../schemas/Player'
import {
  ATTACK_KIND,
  getSkillDamageForKind,
  isWeaponMagicalPrimary,
  resolveWeaponBasicProjectileParams,
} from '../combat/attackDamage'
import { WEAPONS, WEAPON_TYPES, MELEE_PROJECTILE_STATS } from '../config/combatConfig'
import { PLAYER_STATS } from '../config/combatConfig'

describe('attackDamage', () => {
  test('resolveWeaponBasicProjectileParams uses physical totals for basic_sword', () => {
    const p = new Player('s1', 'T', 0, 0)
    expect(p.equippedWeaponId).toBe('basic_sword')
    const r = resolveWeaponBasicProjectileParams(p)
    expect(r.attackKind).toBe(ATTACK_KIND.WEAPON_BASIC)
    expect(r.damageType).toBe('physical')
    expect(r.damage).toBe(PLAYER_STATS.pAtk + WEAPONS.basic_sword.pAtk)
    expect(r.meleeLifetimeMs).toBe(MELEE_PROJECTILE_STATS.projectileLifetime)
  })

  test('great_bow uses ARROW projectile and physical totals', () => {
    const p = new Player('s-bow', 'T', 0, 0)
    p.equipWeapon('great_bow')
    const r = resolveWeaponBasicProjectileParams(p)
    expect(r.projectileType).toBe(WEAPON_TYPES.ARROW)
    expect(r.damageType).toBe('physical')
    expect(r.damage).toBe(PLAYER_STATS.pAtk + WEAPONS.great_bow.pAtk)
    expect(r.atkRange).toBe(WEAPONS.great_bow.range + p.radius)
    expect(r.meleeLifetimeMs).toBe(MELEE_PROJECTILE_STATS.projectileLifetime)
  })

  test('magic_staff favors mAtk and magical damage', () => {
    const p = new Player('s2', 'T', 0, 0)
    p.equipWeapon('magic_staff')
    const r = resolveWeaponBasicProjectileParams(p)
    expect(r.damageType).toBe('magical')
    expect(r.damage).toBe(PLAYER_STATS.mAtk + WEAPONS.magic_staff.mAtk)
    expect(r.meleeLifetimeMs).toBe(MELEE_PROJECTILE_STATS.projectileLifetime)
  })

  test('dagger uses SMALL_MELEE with short range and small hitbox radius', () => {
    const p = new Player('s-dag', 'T', 0, 0)
    p.equipWeapon('dagger')
    const r = resolveWeaponBasicProjectileParams(p)
    expect(r.projectileType).toBe(WEAPON_TYPES.SMALL_MELEE)
    expect(r.damageType).toBe('physical')
    expect(r.damage).toBe(PLAYER_STATS.pAtk + WEAPONS['dagger'].pAtk)
    expect(r.atkRange).toBe(WEAPONS['dagger'].range + p.radius)
    expect(r.pRadius).toBe(WEAPONS.dagger.pRadius)
    expect(r.atkSpeed).toBe(115)
    expect(r.meleeLifetimeMs).toBe(220)
  })

  test('scythe uses LARGE_MELEE with long range and wider hitbox', () => {
    const p = new Player('s-scy', 'T', 0, 0)
    p.equipWeapon('scythe')
    const r = resolveWeaponBasicProjectileParams(p)
    expect(r.projectileType).toBe(WEAPON_TYPES.LARGE_MELEE)
    expect(r.damageType).toBe('physical')
    expect(r.damage).toBe(PLAYER_STATS.pAtk + WEAPONS['scythe'].pAtk)
    expect(r.atkRange).toBe(WEAPONS['scythe'].range + p.radius)
    expect(r.pRadius).toBe(WEAPONS.scythe.pRadius)
    expect(r.atkSpeed).toBe(85)
    expect(r.meleeLifetimeMs).toBe(360)
  })

  test('basic_sword keeps generic MELEE defaults for pRadius and atkSpeed', () => {
    const p = new Player('s-sw', 'T', 0, 0)
    p.equipWeapon('basic_sword')
    const r = resolveWeaponBasicProjectileParams(p)
    expect(r.projectileType).toBe(WEAPON_TYPES.MELEE)
    expect(r.pRadius).toBe(WEAPONS.basic_sword.pRadius)
    expect(r.atkSpeed).toBe(40)
    expect(r.meleeLifetimeMs).toBe(MELEE_PROJECTILE_STATS.projectileLifetime)
  })

  test('isWeaponMagicalPrimary matches weapon stat split', () => {
    expect(isWeaponMagicalPrimary(WEAPONS.basic_sword)).toBe(false)
    expect(isWeaponMagicalPrimary(WEAPONS.magic_staff)).toBe(true)
  })

  test('getSkillDamageForKind returns the stat and its channel together', () => {
    const p = new Player('s3', 'T', 0, 0)
    p.equipWeapon('magic_staff')
    // Direct reads: the function is a pure reader of the two stats, so the values
    // recalculateStats produced are what it must report — paired with the channel
    // they belong to, so a skill's stat and its damage type cannot drift apart.
    expect(getSkillDamageForKind(p, ATTACK_KIND.SKILL_PHYSICAL)).toEqual({
      ok: true,
      damage: p.pAtk,
      damageType: 'physical',
    })
    expect(getSkillDamageForKind(p, ATTACK_KIND.SKILL_MAGICAL)).toEqual({
      ok: true,
      damage: p.mAtk,
      damageType: 'magical',
    })
  })

  test('a magical skill with no magical offence is refused, not silently zero', () => {
    // This is not hypothetical. derivedStats computes mAtk as
    // `atk * 2 * (1 - weapon.rho)` and weaponOffence sets `rho = pAtk / (pAtk + mAtk)`,
    // so a pure-physical blade (and unarmed) yields rho 1 and mAtk of exactly 0.
    const p = new Player('s4', 'T', 0, 0)
    p.pAtk = 120
    p.mAtk = 0
    expect(getSkillDamageForKind(p, ATTACK_KIND.SKILL_MAGICAL)).toEqual({
      ok: false,
      reason: 'no-magical-offence',
    })
  })

  test('a physical skill with no physical offence is refused symmetrically', () => {
    const p = new Player('s5', 'T', 0, 0)
    p.pAtk = 0
    p.mAtk = 80
    expect(getSkillDamageForKind(p, ATTACK_KIND.SKILL_PHYSICAL)).toEqual({
      ok: false,
      reason: 'no-physical-offence',
    })
  })
})
