/**
 * Emits generated/spawn-areas.json — the runtime spawn table's identity and
 * population, for the content gate's G-SPAWN-PAIR rule (F-031). A spawn area
 * authored in content/maps/ that has no same-id counterpart here is a hard
 * FAIL, so the two halves of the split spawn chain cannot drift further apart
 * while I-015 (the real map loader) waits.
 *
 * The artifact is COMMITTED; refresh it whenever mapConfig.ts's mobSpawnAreas
 * change, or the gate FAILs against the stale file.
 *
 * CLI driver only — the pure builder lives in src/config/genSpawnAreas.ts
 * (inside the tsc rootDir, so the unit test's direct import compiles in the
 * production build; importing THIS file from src/tests breaks tsc with
 * TS6059). Run via ts-node --transpile-only.
 */
import { genSpawnAreas } from '../../src/config/genSpawnAreas'

// CLI driver: single optional arg = output file path.
if (require.main === module) {
  const fs = require('fs')
  const path = require('path')
  const outputFilePath =
    process.argv[2] || path.resolve(__dirname, '../../generated/spawn-areas.json')
  const data = genSpawnAreas()
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true })
  fs.writeFileSync(outputFilePath, JSON.stringify(data, null, 2) + '\n')
  console.log(`gen-spawn-areas: wrote ${outputFilePath} (${data.areas.length} areas)`)
}
