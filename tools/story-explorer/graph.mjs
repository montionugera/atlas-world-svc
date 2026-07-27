// Pure story-graph builder — shared by the browser explorer (index.html) and
// the node smoke test, so the picture can never diverge from what's validated.
// Input: an object { acts, regions, factions, characters, arcs, quests,
// events, dialogue, lore } where each value is the parsed JSON array
// (missing kinds default to []).
// Output: { nodes: [{id,kind,title,data}], edges: [{from,to,label}], byId: Map }.

export const KINDS = ['act', 'region', 'faction', 'character', 'arc', 'quest', 'event', 'dialogue', 'lore']

// Single source of truth for every cross-node reference field, mirroring the
// gate's resolveStoryRefs/buildReverseRefIndex (scripts/check_content.mjs)
// edge-for-edge — this table IS the v2 edge set (Global Constraints):
// arc.actId -> act, lore.anchor -> any kind, character.diedAt -> event,
// {quest,event,dialogue}.unlockedBy[] -> quest|event|act (prereq removed),
// plus the unchanged quest giver/arcId/faction/region, arc.questIds,
// character.faction/region, event.involves/triggeredBy, dialogue.speaker/
// context, and faction.relationships[].factionId. Both buildGraph (render)
// and danglingEdges (coherence proxy) derive from this ONE list so they can
// never silently diverge again — any edge kind the gate checks must be
// declared here or the explorer's picture would lie about what got validated.
const unlocks = (n) => (n.unlockedBy ?? []).map((u) => [u, 'unlockedBy'])
const EDGE_SPECS = {
  faction: (n) => (n.relationships ?? []).map((r) => [r.factionId, r.stance]),
  character: (n) => [
    [n.faction, 'of'],
    [n.region, 'in'],
    [n.diedAt, 'diedAt'],
  ],
  arc: (n) => [...(n.questIds ?? []).map((q) => [q, 'quest']), [n.actId, 'act']],
  quest: (n) => [
    [n.giver, 'giver'],
    [n.arcId, 'arc'],
    [n.faction, 'vs'],
    [n.region, 'at'],
    ...unlocks(n),
  ],
  event: (n) => [...(n.involves ?? []).map((i) => [i, 'involves']), [n.triggeredBy, 'triggeredBy'], ...unlocks(n)],
  dialogue: (n) => [[n.speaker, 'speaker'], [n.context, 'in'], ...unlocks(n)],
  lore: (n) => [[n.anchor, 'anchor']],
}

// Every declared (from, to, label) triple for the loaded files, regardless of
// whether `to` resolves to a real node — buildGraph and danglingEdges each
// filter this differently (rendered vs missing).
function declaredEdges(files) {
  const out = []
  for (const kind of KINDS) {
    const spec = EDGE_SPECS[kind]
    if (!spec) continue
    for (const n of files[`${kind}s`] ?? files[kind] ?? []) {
      for (const [to, label] of spec(n)) {
        if (to !== undefined) out.push({ from: n.id, to, label })
      }
    }
  }
  return out
}

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

  const edges = declaredEdges(files).filter((e) => byId.has(e.from) && byId.has(e.to))

  return { nodes, edges, byId }
}

// Every declared edge whose target id doesn't resolve to any loaded node
// (used by the smoke test as a coherence proxy).
export function danglingEdges(files) {
  const ids = new Set()
  for (const kind of KINDS) for (const n of files[`${kind}s`] ?? files[kind] ?? []) ids.add(n.id)
  return declaredEdges(files)
    .filter((e) => !ids.has(e.to))
    .map(({ from, to, label }) => ({ from, field: label, to }))
}
