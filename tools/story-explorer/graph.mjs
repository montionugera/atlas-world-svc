// Pure story-graph builder — shared by the browser explorer (index.html) and
// the node smoke test, so the picture can never diverge from what's validated.
// Input: an object { regions, factions, characters, arcs, quests, events, dialogue }
// where each value is the parsed JSON array (missing kinds default to []).
// Output: { nodes: [{id,kind,title,data}], edges: [{from,to,label}], byId: Map }.

export const KINDS = ['region', 'faction', 'character', 'arc', 'quest', 'event', 'dialogue']

export function buildGraph(files) {
  const nodes = []
  const byId = new Map()
  for (const kind of KINDS) {
    for (const n of files[`${kind}s`] ?? files[kind] ?? []) {
      const node = { id: n.id, kind: n.kind ?? kind, title: n.title ?? n.id, data: n }
      nodes.push(node)
      byId.set(n.id, node)
    }
  }

  const edges = []
  const link = (from, to, label) => {
    if (from && to && byId.has(from) && byId.has(to)) edges.push({ from, to, label })
  }

  for (const { data: n, kind } of nodes) {
    if (kind === 'faction') for (const r of n.relationships ?? []) link(n.id, r.factionId, r.stance)
    if (kind === 'character') { link(n.id, n.faction, 'of'); link(n.id, n.region, 'in') }
    if (kind === 'arc') for (const q of n.questIds ?? []) link(n.id, q, 'quest')
    if (kind === 'quest') {
      link(n.id, n.giver, 'giver')
      link(n.id, n.prereq, 'prereq')
      link(n.id, n.faction, 'vs')
      link(n.id, n.region, 'at')
    }
    if (kind === 'event') for (const i of n.involves ?? []) link(n.id, i, 'involves')
    if (kind === 'dialogue') { link(n.id, n.speaker, 'speaker'); link(n.id, n.context, 'in') }
  }

  return { nodes, edges, byId }
}

// Every edge's endpoints resolve (used by the smoke test as a coherence proxy).
export function danglingEdges(files) {
  const ids = new Set()
  for (const kind of KINDS) for (const n of files[`${kind}s`] ?? []) ids.add(n.id)
  const missing = []
  const check = (from, to, field) => { if (to && !ids.has(to)) missing.push({ from, field, to }) }
  for (const kind of KINDS)
    for (const n of files[`${kind}s`] ?? []) {
      if (kind === 'character') { check(n.id, n.faction, 'faction'); check(n.id, n.region, 'region') }
      if (kind === 'arc') for (const q of n.questIds ?? []) check(n.id, q, 'questIds')
      if (kind === 'quest') { check(n.id, n.giver, 'giver'); check(n.id, n.prereq, 'prereq'); check(n.id, n.arcId, 'arcId') }
      if (kind === 'faction') for (const r of n.relationships ?? []) check(n.id, r.factionId, 'relationships')
    }
  return missing
}
