# Atelier — asset & story build workspace

Everything that builds, reviews, or visualizes non-runtime art/content lives here:
the build tools, their docs, and their review surfaces. Game server (`colyseus-server/`) and
clients (`game-client/`, `client/`) are NOT in this folder and do not depend on it at runtime.

Start with this file. Do not scan the folders unless a task points there — every tool keeps
a deeper README covering internals.

## Tools (each self-contained, own test suite)

| Path | What it does | Tests |
| --- | --- | --- |
| `art-forge/` | AI concept-art generation for environments/towns (brief → block-in → render → artifact gate → provenance ledger) | `node --test art-forge/tests/*.test.mjs` (233) |
| `mapforge/` | Deterministic world-map sheet generator (SVG/PNG atlas + continent sheets from `content/world/`) | `node --test mapforge/tests/*.test.mjs` (786) |
| `asset-forge/` | Blender kitbash → validated character `.glb` pipeline (AUTHOR → BAKE → VALIDATE → INTAKE) | `npm ci --prefix asset-forge && node asset-forge/validate.mjs --manifest game-client/assets/manifest.json` |
| `asset-2d-forge/` | 2D asset intake/validation | `node --test asset-2d-forge/tests/*.test.mjs` |
| `asset-storybook/` | The review surface — every artifact must be observable here (owner rule). All tabs read their registries (`env-index.json`, `maps-index.json`, `world-index.json`) | `node --test asset-storybook/tests/*.test.mjs` |
| `story-explorer/` | Read-only narrative-graph viewer for `content/story/*.json` | `node --test story-explorer/tests/*.test.mjs` |
| `combat-lab/` | Interactive combat-balance viewer (I-028 model) | `node combat-lab/verify.mjs` |

## Pipeline docs (the ABP family — read in this order)

**Current recipe (authoritative):**
- `ABP-town-concept-workflow.md` — the stage machine: brief-check → map-derive → generate ≤5 cells → reviewer → owner verdict → record/stop
- `ABP-town-art-loop.md` — the actual loop as measured (roll → canon review → verdict → change set)
- `ABP-flux-dev-and-anchor.md` — the dev-model + anchor render recipe (the current "measured recipe")
- `ABP-artifact-gate.md` — artifact-gate rates, instability, I-055

**Superseded experiment history (read only as provenance; do NOT build on these):**
- `ABP-model-bakeoff.md`, `ABP-flux-eval.md`, `ABP-anchor-model-choice.md`,
  `ABP-controlnet-replication.md`, `ABP-controlnet-rescue.md`, `ABP-segment-control.md`

> Historical design/plan docs under `docs/superpowers/` and handoff files under the repo root
> still carry old `tools/<tool>/…` paths for these tools — treat `tools/<tool>` ≡ `atelier/<tool>`.

## Quick commands

```bash
node scripts/check_content.mjs                       # content gate — must be 0 failures
npm test --prefix scripts                            # 1371 tests incl. town criteria + budget gates
node --test atelier/art-forge/tests/*.test.mjs       # art-forge suite
node --test atelier/asset-storybook/tests/*.test.mjs # storybook incl. env-index existence gate
node atelier/mapforge/render-sheet.mjs --sheet atlas --no-png --check
# review surface: python3 -m http.server 6007 → http://127.0.0.1:6007/atelier/asset-storybook/index.html
```
