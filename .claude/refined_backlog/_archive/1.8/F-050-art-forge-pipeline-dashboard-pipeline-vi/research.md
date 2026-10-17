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

## Prior-art survey (GitHub/open-source, 2026-08-25)

### Pipeline UX patterns
- **Airflow**: clear/retry is explicit-scope (downstream cascade is opt-in checkboxes); per-attempt history kept keyed by try_number. Steal: attempt ledger + explicit re-run scope.
- **Dagster**: re-execute subset forks from persisted step inputs; **staleness = version comparison** — upstream version changed ⇒ downstream shows stale/outdated *without executing*. Exactly our fork-rerun semantics; adopt input-hash staleness.
- **Prefect**: rich status vocab incl. CACHED; every state transition is an append-only record.
- **GitHub Actions**: chose cascade-with-consent (re-run includes downstream deps behind a confirm dialog) — we prefer Dagster-style non-cascade.
- **ComfyUI**: `/history/{prompt_id}` persists full prompt + per-node outputs + status; supports partial node execution. Store prompt_id per render attempt for direct linkage.
  Sources: airflow.apache.org/docs (dag-run), docs.dagster.io (re-execution, virtual-assets/staleness), docs.prefect.io/v3/concepts/tasks, docs.github.com (re-run workflows), docs.comfy.org (comms_routes).

### Ledger format patterns
- **MLflow run**: info(status, start/end, artifact_uri) + data(params immutable, metrics latest, tags) — our minimal schema mirrors this split without bloat.
- **W&B**: config (declared inputs) vs metrics vs summary; child runs link via sweep id.
- **DVC**: `dvc.lock` stores md5 of every dep/output; recompute + diff marks stage **and all downstream** outdated — mechanism for OQ2 (we display-only, don't auto-execute).
- **Git-friendliness**: append-only **one-line-per-attempt** entries keep diffs tiny and merge-conflicts near zero; pretty-printed arrays rewrite indentation each append. Per-brief file with compact attempt lines; graduate to `.jsonl` past ~100 rows.
  Sources: mlflow.org/docs, docs.wandb.ai (resuming), doc.dvc.org (dvc-files, pipelines).

### Schema adopted per attempt
`{ id, briefHash (sha256 of normalized brief), params {seed, model, stage}, verdict PASS|FLAG, artifacts [paths], comfyPromptId?, startedAt, finishedAt }`
