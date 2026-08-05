import { genSpawnAreas } from '../../config/genSpawnAreas'
import { MAP_CONFIG } from '../../config/mapConfig'

describe('genSpawnAreas', () => {
  it('emits one entry per runtime spawn area', () => {
    const out = genSpawnAreas()
    expect(out.version).toBe(1)
    expect(out.areas).toHaveLength(MAP_CONFIG.mobSpawnAreas.length)
  })

  it('carries only id, mobType and count — geometry is deliberately excluded', () => {
    // The authored map and the runtime map describe different worlds until
    // I-015 lands a real loader, so pairing is on identity and population
    // only. Emitting coordinates would invite a gate rule that must lie.
    for (const a of genSpawnAreas().areas) {
      expect(Object.keys(a).sort()).toEqual(['count', 'id', 'mobType'])
    }
  })

  it('is deterministic: sorted by id', () => {
    const ids = genSpawnAreas().areas.map((a) => a.id)
    expect(ids).toEqual([...ids].sort())
  })

  it('includes the three F-031 Thornveil areas once Task 4 has added them', () => {
    const byId = new Map(genSpawnAreas().areas.map((a) => [a.id, a]))
    // Guard only what this task owns: the builder must faithfully reflect
    // whatever mapConfig holds. Task 4 adds the areas; this asserts the
    // builder does not drop or rename them.
    for (const area of MAP_CONFIG.mobSpawnAreas) {
      expect(byId.get(area.id)).toEqual({
        id: area.id,
        mobType: area.mobType,
        count: area.count,
      })
    }
  })
})
