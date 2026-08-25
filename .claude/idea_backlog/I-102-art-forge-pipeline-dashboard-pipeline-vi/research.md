# Art-forge pipeline dashboard: pipeline view per brief with gate verdicts and per-cell re-run — research notes

## Grounding facts (explored 2026-08-25)

- Pipeline: `tools/art-forge/` (self-contained npm pkg). Stages: blockin (`generate/blockin.mjs`) → env render (`generate/env.mjs`, flux-schnell + depth ControlNet, `--hires` variant) or character cells (`charsheet.mjs`, `i2i.mjs`, `batch-matrix.mjs`) → artifact gate (`artifact-gate.mjs`) → intake (`intake-art.mjs`). Plus `townplan.mjs` (SVG maps, out of scope here).
- Briefs: `tools/art-forge/briefs/<id>.json` (4 today: A1-ART-02…07). Fields: id, subject, prompt, width/height, horizon, focal, masses[].
- Gates: `tools/art-forge/artifact-gate.mjs` — exit 0 PASS / 1 FLAG / 2 usage; `--json` metrics; `--corner-sheet out.png`; bypass via `--skip-artifact-gate "<reason>"` recorded only in intake manifest. Repo-wide: `scripts/check_asset_manifest.mjs` in CI.
- Outputs: `tools/art-forge/out/` is **git-ignored**; files named `<briefId>-seed<seed>[-hires|-s0.30].png`. **No run ledger exists** — verdicts/attempts are ephemeral.
- Generation constraint: human-run, needs SSH+Tailscale tunnel to mont-pc, ComfyUI at 127.0.0.1:8188. Nothing under `generate/` runs in CI.
- Asset-storybook: `tools/asset-storybook/index.html`, static page, no server/write endpoint. Tab infra exists (`js/art-tabs.mjs`). Existing safe trigger pattern: review verdicts written as work orders to committed `content/review-queue.json` (`js/review/store.mjs`) — forge reads this to regenerate.

## Prior art / related

- I-047 art-forge intake hardening · I-054/I-055 artifact-gate hardening (verdicts exist, no surface) · I-030 concept-art manifest gate.
- Review surface design: `docs/superpowers/specs/2026-08-08-asset-storybook-review-surface-design.md` (review→FORGE flow).
- Foundation spec: `docs/superpowers/specs/2026-08-01-art-forge-foundation-design.md`.
- Gate docs: `docs/worldbuilding/ABP-artifact-gate.md`.

## Open questions

- OQ1: ledger granularity — per-brief file vs single ledger.json (lean per-brief).
- OQ2: define "stale" cell (brief edited after attempt) — lean brief-hash comparison.
