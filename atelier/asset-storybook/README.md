# asset-storybook

A static, build-free review surface for everything the atelier produces:
open `index.html`, and `js/main.mjs` reads the game-client manifests
(`game-client/assets/manifest.json`, the catalog/audio/music manifests,
`render-spec.json`, `content/asset-taxonomy.json`) and builds one sidebar
entry per asset class. Nothing in the sidebar is hard-coded — a new `kind`
in a manifest is a new tab. The standing rule (owner, 2026-08-15): **every
produced artifact must be observable here**; wiring a new artifact type in
is part of the feature that produces it, and the maps parity gate
(`tests/maps-index.test.mjs`) enforces it for mapforge sheets.

## Two ways to serve it

- **Read-only** — any static server over the repo root, e.g.
  `python3 -m http.server 7788 --bind 127.0.0.1` then
  `http://127.0.0.1:7788/atelier/asset-storybook/index.html`, or the k8s
  nginx deployment (`k8s/local/storybook.yaml`, `storybook-nginx.conf`, which
  redirects `/` here and never caches `.json`/`.mjs`). Every tab works except
  Map Builder, which shows "Builder service not running".
- **Live** — `node atelier/map-builder/server.mjs` (port 6016) serves the same
  files *and* the `/api` the Map Builder tab drives. Same URL path on that
  port. See [`../map-builder/README.md`](../map-builder/README.md).

## Tabs

- **Asset classes** (one per manifest `kind` family — today `character:*` and
  `vfx:*`) — thumbnail grid with a hover/click preview (`js/renderers.mjs`),
  the render-spec's height framing, and per-asset review verdicts
  (`content/review-queue.json`), with synthetic **Rejected / Needs rebuild /
  Unreviewed** classes that collect verdicts across kinds.
- **SFX** and **Music** — hover-to-play soundboard and BGM list from the audio
  manifests (`js/audio.mjs`).
- **Concept Art** — the art-forge runs and briefs (`atelier/art-forge/`),
  grouped by tab with a filter (`js/art.mjs`, `js/art-tabs.mjs`); reference
  art, not assets the client loads.
- **Coverage** — codegen asset keys (`colyseus-server/generated/asset-keys.json`)
  that have no manifest entry yet (`js/coverage.mjs`).
- **Combat** — the combat balance lab (`atelier/combat-lab`), embedded; it
  depends on no manifest, so it stays reachable even when the manifest fetch
  fails (`js/combat-lab.mjs`).
- **Story** — the story explorer over the views registry `story-views.json`
  beside `index.html` (`js/story.mjs`).
- **Map Sheets** — every mapforge sheet with a pan/zoom viewer and PNG thumbs
  (`js/maps.mjs`, `js/maps-fabric.mjs`, `js/maps-vocabulary.mjs`); the parity
  gate keeps this index and `render-sheet.mjs`'s `SHEETS` in step.
- **Forge** — the asset-forge gallery and export state (`js/forge/`).
- **Map Builder** — the F-052 builder UI (`js/map-builder.mjs`, view-model in
  `js/map-builder-model.mjs`): **Start** (roll or type a seed, drafts table
  with Watch / Cancel / Review / Re-run / Delete), **Build** (stage checklist
  and progress against the 6 s / 12 s budget), **History** (every job kind,
  filter chips, duration vs target, re-run chains with the "Re-run identical /
  differs" badge, Log viewer that follows a running job, bulk cleanup of
  finished drafts older than 7 days), **Review** (draft vs current sheets side
  by side, continent deltas, accept/reject) and **Publish** (confirm →
  publishing → published with Undo and the snapshot count, or failed with the
  auto-restore result). The sidebar badge counts drafts awaiting review. Live
  updates come over SSE with a 2 s poll fallback.

## Tests

```bash
node --test atelier/asset-storybook/tests/*.test.mjs
```

Pure `node:test` over the data-index and view-model modules (no browser):
manifest/index parity gates (`maps-index`, `world-index`, `env-index`,
`render-lock-index`), forge gallery/staleness/export, review-store, thumbs,
taxonomy, vocabulary, and the Map Builder view-model. The DOM modules keep
all `document`/`fetch` use out of the tested modules by design.
