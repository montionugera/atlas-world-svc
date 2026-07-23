# story-explorer

Zero-dependency, no-build browser page that visualizes the whole narrative
graph in `content/story/*.json` (acts, regions, factions, characters, arcs,
quests, events, dialogue, lore). The graph-building logic lives in
`graph.mjs`, a pure `buildGraph(files) → {nodes, edges, byId}` function
imported by both `index.html` (the page), `reader.html` (id→title
resolution), and `tests/smoke.test.mjs` (the test) — so the picture can
never diverge from what's validated.

Two views, linked from each other's header/nav:

- **`index.html`** — the structural graph (9 kind columns, SVG edges). At
  corpus sizes above 60 nodes it no longer draws every edge by default (it's
  an unreadable hairball at 148 nodes / 336 edges) — edges render only when
  a node is selected, or the "all links" header chip is toggled on. Smaller
  graphs keep the old always-on-edges behavior unchanged.
- **`reader.html`** — a typography-first reader mode for actually reading
  the story: acts in order, each act's main arcs with their quests (full
  narrative text, giver/region/faction, inline dialogue and triggered
  events), a side-stories section for arcs whose quests are parallel
  vignettes rather than a chain, a timeline, all lore letters grouped by
  thread, and a character roster.

## What it shows

- One SVG column per node kind (act, region, faction, character, arc, quest,
  event, dialogue, lore), colored by kind, with a header filter chip per kind
  present in the data. The act column is ordered by `act.order`.
- Every cross-reference edge the content gate checks (`scripts/check_content.mjs`'s
  `resolveStoryRefs`/`buildReverseRefIndex`): quest giver/arcId/unlockedBy/faction/region,
  arc.questIds/actId, character.faction/region/diedAt, event.involves/triggeredBy/unlockedBy,
  dialogue.speaker/context/unlockedBy, lore.anchor, and faction.relationships[].factionId.
  `quest.prereq` is gone — `unlockedBy` is the single unlock mechanism (id prefix
  `quest-*`/`event-*`/`act-*` is the semantics).
- Click a node to open a side panel with its raw JSON, its resolved neighbors
  (both directions), and — for a quest, event, or dialogue — a highlighted
  unlock chain (both its full unlock ancestry and everything it transitively
  unlocks, walking `unlockedBy` in both directions).
- Clicking a lore node's panel also renders its `body` text and `#thread` tag.
  A thread filter chip (`#<thread>`) appears per lore thread; clicking one
  highlights every fragment in that thread plus each fragment's `anchor` node.

## Serving it

The page `fetch`es `../../content/story/*.json` relative to `index.html`, so
serve from the repo root:

```bash
python3 -m http.server 7788 --bind 127.0.0.1
```

Then open <http://127.0.0.1:7788/tools/story-explorer/index.html> (graph) or
<http://127.0.0.1:7788/tools/story-explorer/reader.html> (reader mode).

## Tests

```bash
node --test tools/story-explorer/tests/*.test.mjs
```

Runs against the real `content/story/*.json` files (every edge resolves, node
count > 0, v2 edges present and `prereq` gone) plus a synthetic fixture that
exercises every edge kind the gate checks — including `unlockedBy` targeting
an event/act, a dialogue's own `unlockedBy`, and `lore.anchor` — combinations
the real seed content doesn't yet cover in every permutation.
