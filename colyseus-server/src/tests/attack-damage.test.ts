import { Player } from '../schemas/Player'
import {
  ATTACK_KIND,
  getSkillDamageForKind,
  isWeaponMagicalPrimary,
  resolveWeaponBasicProjectileParams,
} from '../combat/attackDamage'
import { WEAPONS } from '../config/combatConfig'
import { PLAYER_STATS } from '../config/combatConfig'

describe('attackDamage', () => {
  test('resolveWeaponBasicProjectileParams uses physical totals for basic_sword', () => {
    const p = new Player('s1', 'T', 0, 0)
    expect(p.equippedWeaponId).toBe('basic_sword')
    const r = resolveWeaponBasicProjectileParams(p)
    expect(r.attackKind).toBe(ATTACK_KIND.WEAPON_BASIC)
    expect(r.damageType).toBe('physical')
    expect(r.damage).toBe(PLAYER_STATS.pAtk + WEAPONS.basic_sword.pAtk)
  })

  test('magic_staff favors mAtk and magical damage', () => {
    const p = new Player('s2', 'T', 0, 0)
    p.equipWeapon('magic_staff')
    const r = resolveWeaponBasicProjectileParams(p)
    expect(r.damageType).toBe('magical')
    expect(r.damage).toBe(PLAYER_STATS.mAtk + WEAPONS.magic_staff.mAtk)
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
