/**
 * Emits generated/mob-types.json — the set of valid server mob type ids
 * (F-013). Single source of truth for the out-of-process content gate
 * (scripts/check_content.mjs --mob-types): a map mobSpawnAreas[].mobType or a
 * story mob:* ref that is not in this set is a hard FAIL.
 *
 * Reads the REAL server config (MOB_TYPES) directly, so the id set can never
 * drift from a hand-copied list. Output is deterministic (dedup + stable
 * lexicographic sort). The artifact is COMMITTED; CI refreshes it before the
 * gates run. Authoring workflow: add a mob definition → run gen-mob-types.sh →
 * commit the refreshed artifact, or local check_content.mjs runs will FAIL
 * against the stale file.
 *
 * Deliberately separate from asset-keys.json's mob:* keys: those mean
 * "renderable", this means "spawnable". Identical today (same MOB_TYPES loop);
 * kept separate so a future renderable-only key (decorative variant,
 * unreleased art) never counts as spawnable.
 *
 * Lives under colyseus-server/scripts/ (not src/) by design, alongside the
 * other codegen entrypoints. Run via ts-node --transpile-only.
 */
import { MOB_TYPES } from '../../src/config/mobs'

export interface MobTypeSet {
  version: number
  mobTypes: string[]
}

const VERSION = 1

/** Build the valid mob type id set from the live server config. */
export function genMobTypes(): MobTypeSet {
  const mobTypes = [...new Set(MOB_TYPES.map((m) => m.id))].sort()
  return { version: VERSION, mobTypes }
}

// CLI driver: single optional arg = output file path.
if (require.main === module) {
  const fs = require('fs')
  const path = require('path')
  const outputFilePath =
    process.argv[2] || path.resolve(__dirname, '../../generated/mob-types.json')
  const data = genMobTypes()
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true })
  fs.writeFileSync(outputFilePath, JSON.stringify(data, null, 2) + '\n')
  console.log(`gen-mob-types: wrote ${outputFilePath} (${data.mobTypes.length} mob types)`)
}
