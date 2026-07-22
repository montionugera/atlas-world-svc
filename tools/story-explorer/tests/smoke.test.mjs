import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGraph, danglingEdges, KINDS } from '../graph.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
// content/story files are plural (regions.json, ...) except dialogue.json,
// which stays singular — mirror that one exception here or this loader
// silently reads a nonexistent dialogues.json and always sees 0 dialogue nodes.
const load = () => {
  const files = {}
  for (const k of KINDS) {
    const filename = k === 'dialogue' ? 'dialogue.json' : `${k}s.json`
    try {
      files[`${k}s`] = JSON.parse(readFileSync(join(ROOT, `content/story/${filename}`), 'utf8'))
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

// Real content/story/events.json + dialogue.json are currently empty arrays,
// so the "real files" tests above can't exercise event/dialogue edges. This
// synthetic fixture wires one node of every kind through EVERY edge field the
// gate's resolveStoryRefs (scripts/check_content.mjs) checks, so buildGraph
// is asserted edge-kind-for-edge-kind against the gate's own edge semantics —
// any kind the gate resolves but graph.mjs doesn't extract would silently lie
// in the rendered picture.
const FIXTURE = {
  regions: [{ id: 'region-x', kind: 'region', title: 'Region X' }],
  factions: [
    { id: 'faction-a', kind: 'faction', title: 'Faction A', relationships: [{ factionId: 'faction-b', stance: 'rival' }] },
    { id: 'faction-b', kind: 'faction', title: 'Faction B' },
  ],
  characters: [{ id: 'char-a', kind: 'character', title: 'Char A', faction: 'faction-a', region: 'region-x' }],
  arcs: [{ id: 'arc-a', kind: 'arc', title: 'Arc A', questIds: ['quest-a'] }],
  quests: [
    { id: 'quest-a', kind: 'quest', title: 'Quest A', giver: 'char-a', arcId: 'arc-a', faction: 'faction-a', region: 'region-x' },
    { id: 'quest-b', kind: 'quest', title: 'Quest B', prereq: 'quest-a' },
  ],
  events: [{ id: 'event-a', kind: 'event', title: 'Event A', involves: ['char-a', 'quest-a'], triggeredBy: 'quest-a' }],
  dialogues: [{ id: 'dlg-a', kind: 'dialogue', title: 'Dlg A', speaker: 'char-a', context: 'quest-a' }],
}

test('buildGraph extracts every edge kind the gate checks (synthetic fixture)', async () => {
  const { buildGraph } = await import('../graph.mjs')
  const { edges } = buildGraph(FIXTURE)
  const has = (from, to) => edges.some((e) => e.from === from && e.to === to)

  const expected = [
    ['quest-a', 'char-a', 'quest.giver -> character'],
    ['quest-a', 'arc-a', 'quest.arcId -> arc'],
    ['quest-b', 'quest-a', 'quest.prereq -> quest'],
    ['quest-a', 'faction-a', 'quest.faction -> faction'],
    ['quest-a', 'region-x', 'quest.region -> region'],
    ['arc-a', 'quest-a', 'arc.questIds -> quest'],
    ['char-a', 'faction-a', 'character.faction -> faction'],
    ['char-a', 'region-x', 'character.region -> region'],
    ['event-a', 'char-a', 'event.involves -> character'],
    ['event-a', 'quest-a', 'event.involves -> quest'],
    ['event-a', 'quest-a', 'event.triggeredBy -> quest'],
    ['dlg-a', 'char-a', 'dialogue.speaker -> character'],
    ['dlg-a', 'quest-a', 'dialogue.context -> quest'],
    ['faction-a', 'faction-b', 'faction.relationships[].factionId -> faction'],
  ]
  for (const [from, to, label] of expected) {
    assert.ok(has(from, to), `missing edge for ${label} (${from} -> ${to})`)
  }
})
