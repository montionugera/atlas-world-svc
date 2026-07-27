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
 * CLI driver only — the pure builder lives in src/config/mobs/genMobTypes.ts
 * (inside the tsc rootDir, so the unit test's direct import compiles in the
 * production build; importing THIS file from src/tests breaks `tsc` with
 * TS6059). Run via ts-node --transpile-only.
 */
import { genMobTypes } from '../../src/config/mobs/genMobTypes'

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
