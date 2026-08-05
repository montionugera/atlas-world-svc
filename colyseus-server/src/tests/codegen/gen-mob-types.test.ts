import { genMobTypes } from '../../config/mobs/genMobTypes'

describe('genMobTypes', () => {
  const data = genMobTypes()

  it('emits version 2', () => {
    // Bumped by F-031 when `elements` was added. Additive: consumers that only
    // read `mobTypes` are unaffected.
    expect(data.version).toBe(2)
  })

  it('carries the defence element of every elemental mob, and omits neutral ones', () => {
    expect(data.elements.thorncrown_drake).toBe('earth') // F-030
    expect(data.elements.bramble_stalker).toBe('earth') // F-031
    expect(data.elements.veil_spearling).toBe('wind') // F-031
    expect(data.elements.bramble_drake).toBe('earth') // F-031
    // The pre-F-030 archetypes are neutral, so they must not appear at all.
    for (const id of ['aggressive', 'balanced', 'defensive', 'hybrid', 'spear_thrower']) {
      expect(data.elements[id]).toBeUndefined()
    }
  })

  it('every element key is also a known mob type', () => {
    for (const id of Object.keys(data.elements)) {
      expect(data.mobTypes).toContain(id)
    }
  })

  it('contains every known mob type id from mobTypesConfig', () => {
    for (const id of [
      'aggressive',
      'balanced',
      'defensive',
      'double_attacker',
      'hybrid',
      'spear_thrower',
    ]) {
      expect(data.mobTypes).toContain(id)
    }
  })

  it('is deduped and lexicographically sorted', () => {
    expect(data.mobTypes).toEqual([...data.mobTypes].sort())
    expect(new Set(data.mobTypes).size).toBe(data.mobTypes.length)
  })

  it('every id is a non-empty string', () => {
    expect(data.mobTypes.length).toBeGreaterThan(0)
    for (const id of data.mobTypes) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    }
  })
})
