/**
 * Map spawn → mob-config binding guard (F-007 Phase 3).
 *
 * Closes a real silent-failure class: `MobLifeCycleManager.spawnMobInArea` does
 * `getMobTypeById(area.mobType)` and, on a miss, logs a warning and `return`s —
 * so a typo in a `mapConfig` spawn area's `mobType` makes that whole area spawn
 * NOTHING, with only a runtime log (MobLifeCycleManager.ts:143-148). This test
 * turns that runtime-only skid into a build-time failure: every spawn area's
 * `mobType`, across every map, must resolve to a real mob config.
 *
 * Server-authoritative: this validates server config against server config; no
 * content sheet or client value participates.
 */
import { MAP_CONFIG, getMobSpawnAreasForMap } from '../config/mapConfig'
import { getMobTypeById } from '../config/mobTypesConfig'

// Every mapId whose spawn set differs from the default, plus one id that falls
// through to MAP_CONFIG.mobSpawnAreas — covers all branches of
// getMobSpawnAreasForMap.
const MAP_IDS = ['map-for-test-deflect', 'map-for-test-projectile', 'default-map']

describe('map spawn areas bind to real mob configs', () => {
  it('every MAP_CONFIG.mobSpawnAreas.mobType resolves via getMobTypeById', () => {
    for (const area of MAP_CONFIG.mobSpawnAreas) {
      expect({ area: area.id, mobType: area.mobType, resolved: !!getMobTypeById(area.mobType) }).toEqual({
        area: area.id,
        mobType: area.mobType,
        resolved: true,
      })
    }
  })

  it.each(MAP_IDS)('every spawn area for map "%s" resolves to a real mob config', (mapId) => {
    const areas = getMobSpawnAreasForMap(mapId)
    expect(areas.length).toBeGreaterThan(0)
    for (const area of areas) {
      expect({ area: area.id, mobType: area.mobType, resolved: !!getMobTypeById(area.mobType) }).toEqual({
        area: area.id,
        mobType: area.mobType,
        resolved: true,
      })
    }
  })

  it('a typo mobType would be caught (negative control)', () => {
    // Proves the guard has teeth: an unknown id does NOT resolve, so if any real
    // spawn area regressed to this, the assertions above would fail.
    expect(getMobTypeById('balancd')).toBeUndefined()
    expect(getMobTypeById('balanced')).toBeDefined()
  })
})
