import { genMobTypes } from '../../../scripts/codegen/gen-mob-types'

describe('genMobTypes', () => {
  const data = genMobTypes()

  it('emits version 1', () => {
    expect(data.version).toBe(1)
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
