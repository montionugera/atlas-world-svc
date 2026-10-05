import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { runDeterministicSimulation } from './harness/DeterministicSimHarness'

const outPath = join(__dirname, 'fixtures', 'golden_sim_trace_1000.json')
mkdirSync(dirname(outPath), { recursive: true })

console.log('🚀 Running 1,000-tick deterministic simulation...')
const start = performance.now()
const { trace, env } = runDeterministicSimulation(0x1337c0de, 1000, 10, 50)
const duration = performance.now() - start

writeFileSync(outPath, JSON.stringify(trace, null, 2), 'utf-8')
console.log(
  `✅ Generated ${outPath} (${(Buffer.byteLength(JSON.stringify(trace)) / 1024).toFixed(1)} KB) in ${duration.toFixed(1)} ms`
)
console.log(`📊 Snapshots recorded: ${trace.snapshots.length}`)
console.log(
  `👥 Alive Players: ${trace.finalSummary.alivePlayers}, Mobs: ${trace.finalSummary.aliveMobs}`
)
env.dispose()
