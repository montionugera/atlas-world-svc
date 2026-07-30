import { derivedStats, weaponOffence, GEAR_REFERENCE } from '@atlas/contracts'
import type { LoadoutSnapshot } from '@atlas/contracts'
import { Player } from '../schemas/Player'
import { applyLoadout } from '../meta/applyLoadout'
import { WEAPONS } from '../config/combat/weapons'
import { WEAPON_TYPES } from '../config/combat/projectileInteractions'

const ALLOCATED = { str: 60, agi: 10, int: 5, vit: 40, dex: 5 }

function snapshot(weapon: string, allocated = ALLOCATED): LoadoutSnapshot {
  return {
    profile: {
      schemaVersion: 2,
      level: 30,
      xp: 0,
      statPoints: 0,
      allocated,
    },
    equippedItemIds: { weapon },
  } as unknown as LoadoutSnapshot
}

describe('applyLoadout + recalculateStats reconciliation', () => {
  it('applies the derived stats from the loadout at join', () => {
    const player = new Player('p1', 'P1')
    applyLoadout(player, snapshot('basic_sword'))

    const expected = derivedStats({
      level: 30,
      allocated: ALLOCATED,
      weaponItemId: 'basic_sword',
    })
    expect(player.pAtk).toBeCloseTo(expected.pAtk, 6)
    expect(player.mAtk).toBeCloseTo(expected.mAtk, 6)
    expect(player.pDef).toBeCloseTo(expected.pDef, 6)
    expect(player.mDef).toBeCloseTo(expected.mDef, 6)
    expect(player.maxHealth).toBeCloseTo(expected.maxHealth, 6)
    expect(player.stat.dex).toBe(ALLOCATED.dex)
  })

  it('switching weapons re-derives instead of clobbering to PLAYER_STATS', () => {
    const player = new Player('p1', 'P1')
    applyLoadout(player, snapshot('basic_sword'))
    const afterJoin = player.pAtk

    player.equipWeapon('scythe')

    // scythe: same str, gear 18/18 vs the sword's 10/18 -> strictly stronger.
    // The bug this pins (I-032): recalculateStats used to reset pAtk to the flat
    // PLAYER_STATS.pAtk plus a weapon addend, discarding level and allocation.
    expect(player.pAtk).toBeCloseTo(
      derivedStats({ level: 30, allocated: ALLOCATED, weaponItemId: 'scythe' }).pAtk,
      6,
    )
    expect(player.pAtk).toBeGreaterThan(afterJoin)
  })

  it('a weapon switch does not heal the player', () => {
    const player = new Player('p1', 'P1')
    applyLoadout(player, snapshot('basic_sword'))
    player.currentHealth = 10

    player.equipWeapon('scythe')

    expect(player.currentHealth).toBe(10)
  })

  it('a bow reads dex, so a str build gains nothing by equipping one', () => {
    const strBuild = new Player('p-str', 'StrBuild')
    applyLoadout(strBuild, snapshot('great_bow'))

    const archer = new Player('p-dex', 'Archer')
    applyLoadout(archer, snapshot('great_bow', { ...ALLOCATED, str: 5, dex: 60 }))

    expect(archer.pAtk).toBeGreaterThan(strBuild.pAtk)
  })

  it('a blade yields exactly zero mAtk, a staff yields mostly mAtk', () => {
    const knight = new Player('p-kn', 'Knight')
    applyLoadout(knight, snapshot('basic_sword'))
    expect(knight.mAtk).toBe(0)

    const mage = new Player('p-mg', 'Mage')
    applyLoadout(mage, snapshot('magic_staff', { ...ALLOCATED, str: 5, int: 60 }))
    expect(mage.mAtk).toBeGreaterThan(mage.pAtk)
  })

  it('an ephemeral player with no loadout still gets usable stats', () => {
    const player = new Player('p1', 'P1')
    player.equipWeapon('basic_sword')
    expect(player.metaAllocated).toBeNull()
    expect(player.pAtk).toBeGreaterThan(0)
    expect(Number.isFinite(player.pAtk)).toBe(true)
  })
})

describe('the two weapon catalogs must agree', () => {
  // colyseus WEAPONS carries projectileType; contracts items.json carries
  // atkStat. Nothing dedups them (I-032), so gate them against each other.
  const EXPECTED_BY_TYPE: Record<string, string> = {
    [WEAPON_TYPES.MELEE]: 'str',
    [WEAPON_TYPES.SMALL_MELEE]: 'str',
    [WEAPON_TYPES.LARGE_MELEE]: 'str',
    [WEAPON_TYPES.ARROW]: 'dex',
    [WEAPON_TYPES.MAGIC_SPEAR]: 'int',
  }

  it.each(Object.keys(WEAPONS))('%s agrees on atkStat and gear', (id) => {
    const w = WEAPONS[id]
    // A new projectileType with no mapping is a gap, not a pass.
    expect(EXPECTED_BY_TYPE[w.projectileType]).toBeDefined()
    expect(weaponOffence(id).atkStat).toBe(EXPECTED_BY_TYPE[w.projectileType])
    expect(weaponOffence(id).gear).toBeCloseTo(
      ((w.pAtk || 0) + (w.mAtk || 0)) / GEAR_REFERENCE,
      9,
    )
  })

  it('no weapon exceeds gear 1 — a stronger weapon must move GEAR_REFERENCE', () => {
    const overs = Object.keys(WEAPONS).filter((id) => weaponOffence(id).gear > 1 + 1e-12)
    expect(overs).toEqual([])
  })
})
