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
    expect(r.pRadius).toBe(0.35)
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
    expect(r.pRadius).toBe(0.6)
    expect(r.atkSpeed).toBe(85)
    expect(r.meleeLifetimeMs).toBe(360)
  })

  test('basic_sword keeps generic MELEE defaults for pRadius and atkSpeed', () => {
    const p = new Player('s-sw', 'T', 0, 0)
    p.equipWeapon('basic_sword')
    const r = resolveWeaponBasicProjectileParams(p)
    expect(r.projectileType).toBe(WEAPON_TYPES.MELEE)
    expect(r.pRadius).toBe(2.0)
    expect(r.atkSpeed).toBe(40)
    expect(r.meleeLifetimeMs).toBe(MELEE_PROJECTILE_STATS.projectileLifetime)
  })

  test('isWeaponMagicalPrimary matches weapon stat split', () => {
    expect(isWeaponMagicalPrimary(WEAPONS.basic_sword)).toBe(false)
    expect(isWeaponMagicalPrimary(WEAPONS.magic_staff)).toBe(true)
  })

  test('getSkillDamageForKind uses pAtk vs mAtk totals', () => {
    const p = new Player('s3', 'T', 0, 0)
    p.equipWeapon('magic_staff')
    expect(getSkillDamageForKind(p, ATTACK_KIND.SKILL_PHYSICAL)).toBe(p.pAtk)
    expect(getSkillDamageForKind(p, ATTACK_KIND.SKILL_MAGICAL)).toBe(p.mAtk)
  })
})
