import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGraph, danglingEdges, KINDS } from '../graph.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const load = () => {
  const files = {}
  for (const k of KINDS) {
    try {
      files[`${k}s`] = JSON.parse(readFileSync(join(ROOT, `content/story/${k}s.json`), 'utf8'))
    } catch {
      files[`${k}s`] = []
    }
  }
  return files
}

test('the real story files build a non-empty graph', () => {
  const { nodes, edges } = buildGraph(load())
  assert.ok(nodes.length > 0, 'graph has nodes')
  assert.ok(edges.length > 0, 'graph has edges')
})

test('no edge in the real story graph dangles', () => {
  const missing = danglingEdges(load())
  assert.deepEqual(missing, [], `dangling edges: ${JSON.stringify(missing)}`)
})

test('the seed quest chain is a valid prereq order (no cycle)', () => {
  const files = load()
  const quests = new Map(files.quests.map(q => [q.id, q.prereq]))
  for (const start of quests.keys()) {
    const seen = new Set()
    let cur = start
    while (cur) {
      assert.ok(!seen.has(cur), `prereq cycle at ${cur}`)
      seen.add(cur)
      cur = quests.get(cur)
    }
  }
})
