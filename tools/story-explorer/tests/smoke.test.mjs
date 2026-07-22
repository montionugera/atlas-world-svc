import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGraph, danglingEdges, KINDS } from '../graph.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
// content/story files are plural (regions.json, ...) except dialogue.json
// and lore.json, which stay singular — mirror that exception here or this
// loader silently reads a nonexistent dialogues.json/lores.json and always
// sees 0 nodes for that kind.
const load = () => {
  const files = {}
  for (const k of KINDS) {
    const filename = k === 'dialogue' ? 'dialogue.json' : k === 'lore' ? 'lore.json' : `${k}s.json`
    try {
      files[`${k}s`] = JSON.parse(readFileSync(join(ROOT, `content/story/${filename}`), 'utf8'))
    } catch {
      files[`${k}s`] = []
    }
  }
  return files
}
const files = load()

test('the real story files build a non-empty graph', () => {
  const { nodes, edges } = buildGraph(files)
  assert.ok(nodes.length > 0, 'graph has nodes')
  assert.ok(edges.length > 0, 'graph has edges')
})

test('no edge in the real story graph dangles', () => {
  const missing = danglingEdges(files)
  assert.deepEqual(missing, [], `dangling edges: ${JSON.stringify(missing)}`)
})

test('v2 edges present and prereq gone', () => {
  const g = buildGraph(files)
  const labels = new Set(g.edges.map((e) => e.label))
  for (const must of ['unlockedBy', 'act', 'diedAt', 'anchor']) assert.ok(labels.has(must), must)
  assert.ok(!labels.has('prereq'))
})

test('EDGE_SPECS parity: every gate edge kind is declared', () => {
  // parity proxy: seed exercises every edge kind; no dangling edges
  assert.deepEqual(danglingEdges(files), [])
  const g = buildGraph(files)
  assert.ok(g.nodes.some((n) => n.kind === 'act'))
  assert.ok(g.nodes.some((n) => n.kind === 'lore'))
})

// Real content/story/*.json now covers most edge kinds, but not every
// combination the gate resolves (e.g. unlockedBy pointing at an event/act,
// or a dialogue's own unlockedBy). This synthetic fixture wires one node of
// every kind through EVERY edge field the gate's resolveStoryRefs
// (scripts/check_content.mjs) checks, so buildGraph is asserted
// edge-kind-for-edge-kind against the gate's own edge semantics — any kind
// the gate resolves but graph.mjs doesn't extract would silently lie in the
// rendered picture.
const FIXTURE = {
  acts: [{ id: 'act-a', kind: 'act', title: 'Act A', order: 1 }],
  regions: [{ id: 'region-x', kind: 'region', title: 'Region X' }],
  factions: [
    { id: 'faction-a', kind: 'faction', title: 'Faction A', relationships: [{ factionId: 'faction-b', stance: 'rival' }] },
    { id: 'faction-b', kind: 'faction', title: 'Faction B' },
  ],
  characters: [
    { id: 'char-a', kind: 'character', title: 'Char A', faction: 'faction-a', region: 'region-x' },
    { id: 'char-b', kind: 'character', title: 'Char B', status: 'dead', diedAt: 'event-a' },
  ],
  arcs: [{ id: 'arc-a', kind: 'arc', title: 'Arc A', questIds: ['quest-a'], actId: 'act-a' }],
  quests: [
    { id: 'quest-a', kind: 'quest', title: 'Quest A', giver: 'char-a', arcId: 'arc-a', faction: 'faction-a', region: 'region-x' },
    { id: 'quest-b', kind: 'quest', title: 'Quest B', unlockedBy: ['quest-a'] },
  ],
  events: [
    { id: 'event-a', kind: 'event', title: 'Event A', involves: ['char-a', 'quest-a'], triggeredBy: 'quest-a', unlockedBy: ['quest-a'] },
  ],
  dialogues: [{ id: 'dlg-a', kind: 'dialogue', title: 'Dlg A', speaker: 'char-a', context: 'quest-a', unlockedBy: ['event-a'] }],
  lores: [{ id: 'lore-a', kind: 'lore', title: 'Lore A', body: 'body', anchor: 'faction-a', thread: 'thread-1' }],
}

test('buildGraph extracts every edge kind the gate checks (synthetic fixture)', async () => {
  const { buildGraph } = await import('../graph.mjs')
  const { edges } = buildGraph(FIXTURE)
  const has = (from, to, label) => edges.some((e) => e.from === from && e.to === to && e.label === label)

  const expected = [
    ['quest-a', 'char-a', 'giver', 'quest.giver -> character'],
    ['quest-a', 'arc-a', 'arc', 'quest.arcId -> arc'],
    ['quest-b', 'quest-a', 'unlockedBy', 'quest.unlockedBy -> quest'],
    ['quest-a', 'faction-a', 'vs', 'quest.faction -> faction'],
    ['quest-a', 'region-x', 'at', 'quest.region -> region'],
    ['arc-a', 'quest-a', 'quest', 'arc.questIds -> quest'],
    ['arc-a', 'act-a', 'act', 'arc.actId -> act'],
    ['char-a', 'faction-a', 'of', 'character.faction -> faction'],
    ['char-a', 'region-x', 'in', 'character.region -> region'],
    ['char-b', 'event-a', 'diedAt', 'character.diedAt -> event'],
    ['event-a', 'char-a', 'involves', 'event.involves -> character'],
    ['event-a', 'quest-a', 'involves', 'event.involves -> quest'],
    ['event-a', 'quest-a', 'triggeredBy', 'event.triggeredBy -> quest'],
    ['event-a', 'quest-a', 'unlockedBy', 'event.unlockedBy -> quest'],
    ['dlg-a', 'char-a', 'speaker', 'dialogue.speaker -> character'],
    ['dlg-a', 'quest-a', 'in', 'dialogue.context -> quest'],
    ['dlg-a', 'event-a', 'unlockedBy', 'dialogue.unlockedBy -> event'],
    ['lore-a', 'faction-a', 'anchor', 'lore.anchor -> faction'],
    ['faction-a', 'faction-b', 'rival', 'faction.relationships[].factionId -> faction'],
  ]
  for (const [from, to, label, desc] of expected) {
    assert.ok(has(from, to, label), `missing edge for ${desc} (${from} -> ${to})`)
  }
})
