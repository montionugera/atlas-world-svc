# atlas-world-panels (deprecated shell — now the atlas-world panels)

> **Deprecated as a standalone site.** The nginx storybook pod, its image and the
> `atlas-storybook.joymify.local.com` workload are retired. The review surface is
> **atlas-world** (`scripts/catalog_explorer_web.py`, `:8788`,
> <http://atlas-world.joymify.local.com/>); the old hostname permanently redirects to
> `/?tab=assets`, and `index.html` here is only a redirect stub for old bookmarks.
>
> This directory still holds what atlas-world mounts: the panel modules (`js/panels/`),
> the data-layer modules they wrap (`js/*.mjs`), `css/panels.css`, the registries
> (`*-index.json`, `story-views.json`) and the tests. The path stays until the optional
> rename (the Map Builder publish step runs `tests/maps-index.test.mjs` from here).

The standing rule (owner, 2026-08-15) is unchanged: **every produced artifact must be
observable in the review surface**; wiring a new artifact type in is part of the feature
that produces it. The maps parity gate (`tests/maps-index.test.mjs`) enforces it for
mapforge sheets, and `tests/panel-parity.test.mjs` fails if a storybook tab has no
atlas-world panel.

## Run it

```bash
python3 scripts/catalog_explorer_web.py --port 8788      # http://127.0.0.1:8788/?tab=assets
node atelier/map-builder/server.mjs                      # optional: the Map Builder API on :6016
```

The explorer serves this directory read-only through an allowlist
(`scripts/atlas_world_web/static_mounts.py`); the only writes are the review-queue
endpoints and the Map Builder proxy (`scripts/atlas_world_web/routes.py`).

## Panels (storybook tab → atlas-world tab)

| Panel module | atlas-world URL | What it is |
|---|---|---|
| `panels/assets.mjs` | `?tab=assets[&kind=…&key=…]` | Asset classes per manifest `kind` — thumbnail grid, `<model-viewer>` detail overlay with height framing (vendored at `/vendor/model-viewer.min.js`) |
| `panels/audio.mjs` | `?tab=audio[&mode=sfx\|music]` | Hover-to-play SFX soundboard and BGM list |
| `panels/art.mjs` | `?tab=art[&group=…]` | Concept art over `game-client/assets/art/` — reference art, not assets the client loads |
| `panels/coverage.mjs` | `?tab=coverage` | Codegen asset keys (`content/generated/asset-keys.json`) with no manifest entry yet |
| `panels/story.mjs` | `?tab=story&view=reader\|graph\|undertow` | Story explorer and Undertow novel (iframes from `story-views.json`); `view=nodes` stays the inline story graph |
| `panels/map-sheets.mjs` | `?tab=map-sheets` | Every mapforge sheet with pan/zoom viewer, fabric census and vocabulary |
| `panels/map-builder.mjs` | `?tab=map-builder` | F-052 Map Builder UI over the `/api/map-builder/*` proxy; "Builder service not running" while `:6016` is down |
| `panels/combat-lab.mjs` | `?tab=combat-lab` | The combat design model (`atelier/combat-lab`), beside the Rust Balance Simulator |
| `panels/review-verdicts.mjs` | `?tab=review&view=verdicts[&verdict=reject\|rebuild\|unreviewed]` | Reject / rebuild marks per asset; each mark is POSTed to `/api/review-queue/asset-verdicts` (no download step) |
| `panels/forge.mjs` | `?tab=forge` | Art-forge runs, briefs and work orders; Save POSTs drafts to `/api/review-queue/work-orders` |

`panels/registry.mjs` mounts each panel once into `#panelHost` and only hides/shows it
afterwards, so decoded audio, the 3D viewer and pan/zoom survive tab switches.

## Tests

```bash
node --test atelier/atlas-world-panels/tests/*.test.mjs
STORYBOOK_SMOKE_REQUIRED=1 node atelier/atlas-world-panels/tests/smoke/run.mjs   # needs Chrome
```

The `node:test` files are pure data-layer/view-model tests plus static gates:
manifest/index parity (`maps-index`, `world-index`, `env-index`, `render-lock-index`),
`panel-parity` (every tab has a registered panel), `static-mounts` (every URL a panel
fetches is on the server's allowlist), forge, review-store, thumbs, taxonomy, vocabulary.

The Chrome smoke spawns `catalog_explorer_web.py` on a free port with
`ATLAS_REVIEW_QUEUE_PATH` pointed at a temp copy of `content/review-queue.json` (a smoke
run never dirties the repo) and `MAP_BUILDER_PORT` pointed at a dead port, then drives
the forge, audio (tab-switch persistence), assets (`<model-viewer>`), review (verdict
round trip) and map-builder-down scenarios. CI sets `STORYBOOK_SMOKE_REQUIRED=1`.
