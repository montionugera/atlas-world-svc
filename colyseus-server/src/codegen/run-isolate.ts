import { isolateSchemas } from './isolate-schemas'

// CLI driver for the schema isolator. Args are passed as argv (not interpolated
// into an eval string) so paths with spaces/quotes can't break the invocation.
const [, , inputDir, outputDir] = process.argv
if (!inputDir || !outputDir) {
  console.error('usage: run-isolate <inputDir> <outputDir>')
  process.exit(1)
}

const written = isolateSchemas(inputDir, outputDir)
console.log(`isolate: wrote ${written.length} stripped schema files to ${outputDir}`)
