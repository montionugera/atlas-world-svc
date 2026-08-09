/**
 * Pure builder for generated/spawn-areas.json — the RUNTIME spawn table's
 * (id, mobType, count) triples, consumed by the out-of-process content gate
 * (scripts/check_content.mjs, rule G-SPAWN-PAIR / F-031).
 *
 * WHY an artifact at all: the gate is a plain .mjs script and cannot import
 * TypeScript. Regex-parsing mapConfig.ts would be fragile, so this mirrors what
 * gen-mob-types.sh already does for MOB_TYPES — read the live config, emit
 * deterministic JSON, commit it.
 *
 * Geometry is deliberately EXCLUDED. The authored map (content/maps/) and the
 * runtime map describe different worlds until I-015 lands a real map loader;
 * pairing is on identity and population only, never on coordinates. Emitting
 * coordinates would invite a gate rule that has to lie about five pre-existing
 * mismatches.
 *
 * Lives under src/ (inside the tsc rootDir) so the unit test's direct import
 * compiles in the production build — importing a scripts/codegen/*.ts file
 * from src/tests breaks tsc with TS6059 (the F-013 lesson).
 */
import { MAP_CONFIG } from './mapConfig'

export interface SpawnAreaRef {
  id: string
  mobType: string
  count: number
}

export interface SpawnAreaSet {
  version: number
  areas: SpawnAreaRef[]
}

const VERSION = 1

/** Build the runtime spawn-area reference set from the live server config. */
export function genSpawnAreas(): SpawnAreaSet {
  const areas = MAP_CONFIG.mobSpawnAreas
    .map(a => ({ id: a.id, mobType: a.mobType, count: a.count }))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  return { version: VERSION, areas }
}
