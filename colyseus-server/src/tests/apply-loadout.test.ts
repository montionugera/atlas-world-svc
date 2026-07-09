import { LoadoutSnapshot, derivedStats } from '@atlas/contracts'
import { Player } from '../schemas/Player'
import { FakeMetaBackend } from '../meta/FakeMetaBackend'
import { applyLoadout, loadPlayerLoadout } from '../meta/applyLoadout'

function buildSnapshot(overrides: Partial<LoadoutSnapshot['profile']> = {}): LoadoutSnapshot {
  return {
    schemaVersion: 1,
    profile: {
      schemaVersion: 1,
      level: 5,
      xp: 0,
      statPoints: 0,
      allocated: { str: 8, agi: 6, int: 3, vit: 10 },
      ...overrides,
    },
    equippedItemIds: {},
    skillLoadout: [],
    activeQuestIds: [],
  }
}

describe('applyLoadout', () => {
  it('sets player combat stats to the derivedStats output for a level-5 snapshot', () => {
    const player = new Player('p1', 'Tester')
    const snapshot = buildSnapshot()

    applyLoadout(player, snapshot)

    const expected = derivedStats({
      level: snapshot.profile.level,
      allocated: snapshot.profile.allocated,
      weaponItemId: snapshot.equippedItemIds.weapon,
    })

    expect(player.maxHealth).toBe(expected.maxHealth)
    expect(player.currentHealth).toBe(expected.maxHealth)
    expect(player.pAtk).toBe(expected.pAtk)
    expect(player.mAtk).toBe(expected.mAtk)
    expect(player.pDef).toBe(expected.pDef)
    expect(player.mDef).toBe(expected.mDef)
    expect(player.maxMoveSpeed).toBe(expected.maxMoveSpeed)
    expect(player.maxLinearSpeed).toBe(expected.maxMoveSpeed)
  })
})

describe('loadPlayerLoadout', () => {
  it('applies the backend snapshot when available', async () => {
    const backend = new FakeMetaBackend()
    const snapshot = buildSnapshot()
    backend.setLoadout('user-1', snapshot)
    const player = new Player('p1', 'Tester')

    await loadPlayerLoadout({ player, backend, userId: 'user-1' })

    const expected = derivedStats({
      level: snapshot.profile.level,
      allocated: snapshot.profile.allocated,
      weaponItemId: snapshot.equippedItemIds.weapon,
    })
    expect(player.maxHealth).toBe(expected.maxHealth)
    expect(player.isEphemeral).toBe(false)
  })

  it('marks the player ephemeral and keeps defaults when the backend has no loadout', async () => {
    const backend = new FakeMetaBackend()
    const player = new Player('p1', 'Tester')
    const defaultMaxHealth = player.maxHealth
    const defaultPAtk = player.pAtk
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await loadPlayerLoadout({ player, backend, userId: 'unknown-user' })

    expect(player.isEphemeral).toBe(true)
    expect(player.maxHealth).toBe(defaultMaxHealth)
    expect(player.pAtk).toBe(defaultPAtk)
    expect(errSpy).toHaveBeenCalledWith('[meta] ephemeral join', 'unknown-user')

    errSpy.mockRestore()
  })
})
