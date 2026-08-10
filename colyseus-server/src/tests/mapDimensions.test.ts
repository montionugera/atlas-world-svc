/**
 * F-041 Phase 4 pin: the spine-generated map-dimensions constant must equal
 * the live hand-authored server config. The generated module is emitted by
 * scripts/check_spine_emit.mjs (G-EMIT-DRIFT byte-checks it in CI); this
 * test binds generated content to runtime truth so neither can drift alone.
 * mapConfig.ts itself is deliberately NOT modified in 1.8.
 */
import { GENERATED_MAP_DIMENSIONS } from '../config/generated/mapDimensions'
import { getMapDimensions } from '../config/mapConfig'

const LIVE_MAP_IDS = ['map-01-sector-a', 'map-for-play', 'map-for-test-deflect', 'map-for-test-projectile']

describe('generated mapDimensions mirrors live server config', () => {
  it('covers exactly the four live map ids', () => {
    expect(Object.keys(GENERATED_MAP_DIMENSIONS).sort()).toEqual([...LIVE_MAP_IDS].sort())
  })

  it.each(LIVE_MAP_IDS)('"%s" matches getMapDimensions', mapId => {
    expect(GENERATED_MAP_DIMENSIONS[mapId]).toEqual(getMapDimensions(mapId))
  })
})
