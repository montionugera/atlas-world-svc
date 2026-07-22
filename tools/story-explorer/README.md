# story-explorer

Zero-dependency, no-build browser page that visualizes the whole narrative
graph in `content/story/*.json` (regions, factions, characters, arcs, quests,
events, dialogue). The graph-building logic lives in `graph.mjs`, a pure
`buildGraph(files) → {nodes, edges, byId}` function imported by both
`index.html` (the page) and `tests/smoke.test.mjs` (the test) — so the
picture can never diverge from what's validated.

## What it shows

- One SVG column per node kind, colored by kind, with a header filter chip
  per kind present in the data.
- Every cross-reference edge the content gate checks (`scripts/check_content.mjs`'s
  `resolveStoryRefs`): quest giver/arcId/prereq/faction/region, arc.questIds,
  character.faction/region, event.involves/triggeredBy, dialogue.speaker/context,
  and faction.relationships[].factionId.
- Click a node to open a side panel with its raw JSON, its resolved neighbors
  (both directions), and — for a quest — a highlighted prereq chain (both
  its prerequisites and any quests that require it).

## Serving it

The page `fetch`es `../../content/story/*.json` relative to `index.html`, so
serve from the repo root:

```bash
python3 -m http.server 7788 --bind 127.0.0.1
```

Then open <http://127.0.0.1:7788/tools/story-explorer/index.html>.

## Tests

```bash
node --test tools/story-explorer/tests/*.test.mjs
```

Runs against the real `content/story/*.json` files (every edge resolves, node
count > 0, no prereq cycle) plus a synthetic fixture that exercises every
edge kind the gate checks — including `event`/`dialogue` edges, which the
real content can't yet cover since those two files are currently empty.
