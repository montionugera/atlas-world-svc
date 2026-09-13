---
title: "Map builder service: seed → generate → review → accept into storybook, with monitoring + re-run"
id: I-121
status: spec-draft
date: 2026-09-13
---

# Map Builder: a local builder service + storybook tab

## Problem

Producing a new world map today is six hand-run commands (`generate-world.mjs`, read
`report.md`, `promote-world.mjs --dry-run`, `promote-world.mjs --from`, `render-sheet.mjs --png`,
`check_render_lock.mjs --write`) with no record of what was run, how long it took, whether it
failed, or how a draft compares with the current world before it replaces it. F-051's completion
notes record the cost: "verified" claims that did not reproduce on re-run because nobody saved
the run. The asset-storybook shows the *result* (Map Sheets tab) but nothing about the *process*.

## Why now

The world-fill programme (Plans A–E) is done: the generator is deterministic (G-REPRO), promotion
is a fixpoint, and a full world builds in ~6 s. The pipeline is stable enough to put a UI on. The
UX has already been designed on a Claude Design canvas (five boards: Flow, Main, Build, Review,
Accept); this spec turns that design into a buildable system. Owner decision 2026-09-13: build it
as a long-term feature with UX, monitoring and re-run as first-class concerns.

## Decisions (batch-grill, 2026-09-13)

- Service shape → **one local Node process serves the storybook static files and a `/api` job
  runner** — no CORS, one thing to start; in nginx/k8s the tab degrades to read-only.
- Accept & publish → **promote + render + lock, NO git commit; undo restores a pre-publish
  snapshot** — keeps git writes out of the service and respects the ps-release-workflow guard.
- Monitoring → **in-app: job list, per-step progress, logs, timings, run history, persisted as
  JSON** — survives restarts; no Prometheus in this feature.
- Delivery → **one feature, three phased plans** — each phase shippable on its own.
- Runtime (default, not asked) → Node built-in `http` only, no framework dependency — matches the
  dependency-free `node --test` convention of every other atelier package.
- Concurrency (default) → 2 drafts at once, configurable — the canvas copy already says so.
- Bind (default) → `127.0.0.1` only, port 6006, fall back to 6007 silently — local tool, no auth.
- Draft location (default) → `build/mapforge/<seed>-<version>/` exactly as the generator's own
  default — nothing new to gitignore.

## Approaches considered

1. **One Node process: static storybook + `/api` + SSE (chosen).** Simplest to start, no CORS,
   the tab reads live and static data from one origin. Cost: the storybook gets a second local
   serving path next to `python3 -m http.server` / nginx; mitigated by keeping the static layout
   identical to the Dockerfile's.
2. Separate API on a second port, storybook untouched. Cleaner boundary but two processes, CORS,
   and a second port to remember; nothing here needs the separation.
3. CLI writes job JSON, static tab polls it. No live push, no cancel, no start from the UI —
   fails the "UX first-class" brief.

## Orientation

**What we're building.** A small local service under `atelier/map-builder/` that runs the
existing map scripts as tracked jobs, and a **Map Builder** tab in the asset-storybook that lets
you pick a seed, watch drafts build step by step, review a draft side by side with the current
world, publish it (promote + redraw + lock) and undo that publish. Every job is persisted so you
can see history, re-run any job, and compare a re-run with the original.

**Not building.** Git commits from the UI, remote/k8s execution, multi-user access, auth,
PNG rasterisation of drafts (the generator has no draft PNG path), Prometheus metrics.

## Design

### 1. Architecture

```
browser ── GET /            ──▶ atelier/asset-storybook/ (static, same layout as Dockerfile)
        ── GET /content/… , /build/mapforge/… , /game-client/assets/art/maps/…  (static mounts)
        ── GET/POST /api/*  ──▶ server.mjs ─▶ JobQueue ─▶ Runner (child_process.spawn)
        ── GET /api/events  ◀── SSE: job.created / job.step / job.done / world.changed
                                 │
                                 ├─ build/map-builder/jobs/<id>.json + <id>.log   (persisted)
                                 ├─ build/map-builder/snapshots/<ts>-<seed>/      (pre-publish)
                                 └─ build/mapforge/<seed>-<ver>/                  (drafts)
```

One process, started with `pnpm map-builder` (root script → `node atelier/map-builder/server.mjs`).
The storybook tab is a normal storybook module (`atelier/asset-storybook/js/map-builder.mjs`)
mounted from `js/main.mjs` like `mountMaps`. When `GET /api/health` fails (nginx, k8s, plain
`http.server`) the tab renders a read-only notice: "Builder service not running — start it with
`pnpm map-builder`" and hides every action.

### 2. Components (all under `atelier/map-builder/`)

| Unit | Does | Depends on |
|---|---|---|
| `server.mjs` | http server; static file serving with the storybook's URL layout; routes `/api/*`; SSE fan-out | `lib/*` |
| `lib/jobs.mjs` | JobStore: create/read/list/update job records as JSON files; log file append; survives restart (queued/running jobs found on boot are marked `interrupted`) | fs |
| `lib/queue.mjs` | JobQueue: FIFO with concurrency N (default 2), per-kind timeouts, cancel | JobStore, Runner |
| `lib/runner.mjs` | Runs one job kind as spawned script(s); streams stdout/stderr to the log; parses `stage:` lines into steps | child_process |
| `lib/stage-parser.mjs` | Pure parser for `generate-world.mjs --stage-report` output (`stage: <name> <label> <ms> ms`) and the publish step boundaries | — |
| `lib/world.mjs` | Reads the current world: seed from `content/world/manifest.json`, sheet list from `render-sheet.mjs`'s `SHEETS`, render-lock state, sea:land, git branch + dirty world files (read-only `git` queries) | fs, git (read-only) |
| `lib/review.mjs` | Builds the review payload for a draft: metrics, per-continent deltas draft vs current, dry-run write/delete list, gate results, sheet URLs | world.mjs, promote dry-run |
| `lib/snapshots.mjs` | Snapshot/restore of the frozen world file set; keeps the last 3 | fs |
| `config.json` | port, bind, concurrency, timeouts, snapshot retention | — |
| `tests/*.test.mjs` | see §9 | node:test |

Each unit is a plain ES module with one exported factory that takes an options object
(repo invariant: single options object, no positional overloads).

### 3. Job model

```jsonc
{
  "id": "j_20260913_140201_3f81c0aa",     // sortable
  "kind": "draft" | "dry-run" | "publish" | "undo",
  "seed": "3f81c0aa9d2e5b17",             // 16 lowercase hex, validated before enqueue
  "reason": "coastline too regular",      // free text from the Start form, optional
  "status": "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted",
  "createdAt": "…", "startedAt": "…", "endedAt": "…", "durationMs": 5400,
  "targetMs": 6000, "timeoutMs": 12000,   // from content/world/budgets.json loop budget × 2
  "steps": [ { "name": "roads", "label": "Roads", "ms": 390, "status": "done" }, … ],
  "outDir": "build/mapforge/3f81c0aa9d2e5b17-3.0.0",
  "exitCode": 1, "error": "loop budget exceeded in settlements",   // failed only
  "rerunOf": "j_…",                        // set by /rerun
  "rerunMatch": "identical" | "differs" | null,   // draft re-runs: manifest hash compare
  "metrics": { "seaLand": 1.52, "settlements": 212, "landforms": 41, "regions": 44 },
  "review": { "decision": "accepted" | "rejected" | null, "reasons": ["too much sea"], "at": "…" }
}
```

**Job kinds → commands** (exact flags verified against the scripts, 2026-09-13):

- `draft` → `node atelier/mapforge/generate-world.mjs --seed <s> --out build/mapforge/<s>-<ver> --no-png --stage-report`; then `node atelier/mapforge/promote-world.mjs --dry-run --from <out>` to capture the write/delete list and gate state for the review screen. Fails on non-zero exit; the generator's own refusals (bad seed, foreign files in `--out`, loop-budget overrun) surface verbatim in the log and the `error` field.
- `dry-run` → the second half of `draft`, runnable alone from the review screen ("Re-check").
- `publish` (composite, one job, six steps mirroring the canvas Accept board) →
  1. snapshot the frozen world (§5);
  2. `promote-world.mjs --from <out>` (this already runs `check_spine_emit --write`, renders, and runs the content gate);
  3. `render-sheet.mjs --sheet <id> --png` for every id in `SHEETS` (17 today);
  4. rebuild `atelier/asset-storybook/maps-index.json` the way the existing storybook build does (the plan names the script; the SHEETS parity gate must stay green);
  5. `scripts/check_render_lock.mjs --write`;
  6. verify: `check_render_lock.mjs --check` exits 0 and `content/world/manifest.json` seed equals the draft seed.
  Any step failing stops the job, marks it `failed`, and offers "Restore snapshot" in the UI.
- `undo` → restore the named snapshot, then `check_render_lock.mjs --check`; world.changed event.

Timeouts: `draft` = 2 × the generator's loop budget from `content/world/budgets.json` (6 s target → 12 s "stops here", as the canvas shows); `publish` = 120 s; on timeout the child is killed (SIGTERM, then SIGKILL after 5 s) and the job is `failed` with `error: "took too long"`.

Cancel: `POST /api/jobs/:id/cancel` on a queued job removes it; on a running `draft` it kills the child. `publish` cannot be cancelled after step 2 starts (the world is mid-replace); the UI disables the button and says why.

Re-run: `POST /api/jobs/:id/rerun` clones `kind`, `seed`, `reason` into a new job with `rerunOf` set. For a `draft`, the generator's `clearRun()` wipes its own six entries in the same out dir, so the re-run overwrites in place; on completion the service compares the new `manifest.json` hashes with the ones recorded on the original job and stores `rerunMatch` — a live G-REPRO check surfaced as a badge ("Re-run identical" / "Re-run differs").

### 4. HTTP API (`/api`, JSON, local only)

| Method + path | Purpose |
|---|---|
| `GET /health` | `{ ok, version, pid, repoRoot, branch }` — the tab's live/read-only switch |
| `GET /world` | current seed, sea:land + allowed band, sheet count + lock state, branch, dirty world files (warning), last publish |
| `GET /jobs?kind=&status=&seed=&limit=` | history, newest first |
| `POST /jobs` | `{ kind:"draft", seed, reason, count }` → enqueues `count` jobs (count ≥ 2 = same seed? no: the Start form's "Drafts at once" spawns `count` jobs with **distinct random seeds** unless the user typed one, in which case count is forced to 1) |
| `GET /jobs/:id` · `GET /jobs/:id/log` | record; raw log (text/plain, supports `?tail=200`) |
| `POST /jobs/:id/cancel` · `POST /jobs/:id/rerun` · `DELETE /jobs/:id` | as §3; DELETE also removes the draft dir, never a snapshot |
| `GET /drafts/:jobId/review` | review payload (§6) |
| `POST /drafts/:jobId/decision` | `{ decision:"rejected", reasons:[…] }` — records only; rejecting keeps the draft dir until deleted |
| `POST /publish` | `{ draftJobId, confirm:true }` → enqueues a `publish` job; refuses (409) if another publish/undo is queued or running |
| `GET /snapshots` · `POST /undo` | list; `{ snapshotId }` → enqueues `undo` |
| `GET /events` | SSE stream of `job.*` and `world.changed`; the tab reconnects with `Last-Event-ID` |

Errors are `{ error: { code, message } }` with 400 (validation), 404, 409 (state conflict), 500.
Seed validation is the generator's own regex `^[0-9a-f]{16}$`; random seeds come from
`crypto.randomBytes(8).toString("hex")`.

### 5. Snapshot & undo (the "no git commit" contract)

Before `publish` step 2 the service copies the **frozen world file set** to
`build/map-builder/snapshots/<ISO-ts>-<currentSeed>/`:
`content/world/manifest.json`, `content/world/{fabric,handles,resolved}/`,
`content/spine/nodes/`, `content/spine/derived.json`, `content/world/render-lock.json`,
`game-client/assets/art/maps/`, `atelier/asset-storybook/maps-index.json`.
The snapshot carries a `snapshot.json` (seed, time, file count, sha256 per file). Undo is a pure
file restore of that set (delete-then-copy per directory) followed by `check_render_lock --check`.
The last 3 snapshots are kept; older ones are pruned after a successful publish, never during one.
Git is never written; `GET /world` shows the branch and any dirty world files so the user knows
what a publish would overwrite, and the UI shows the standard "commit through your release
workflow" hint after a publish.

### 6. UX — storybook tab, mapped to the approved canvas boards

Sidebar item **Map Builder** with a badge = drafts in `succeeded` with no decision ("1 to review").

- **Start** (canvas *Main*): header card = `GET /world` (Locked · seed · sea:land vs band · 17
  sheets · "Open in Map Sheets" · branch · dirty-files warning). Form: Seed (16 hex, live
  validation) + **Random**, "Why a new world?" (optional), "Drafts at once" stepper 1–4,
  **Build N**. Table *Drafts (N)*: Seed / Status / Sea to land / Build time / Started / action.
  Status strings are exactly the canvas set: "Queued", "Building · step 11 of 20", "Ready to
  review", "Failed · took too long" (or the generator's first error line), "Rejected · <reason>",
  "Published". Row actions: Watch / Review / See why / Re-run / Delete / Cancel.
- **Build** (canvas *Build*): left rail of the batch; per draft a progress bar with the 6 s
  target and 12 s stop marks, "What is happening now" = current step label, the grouped 20-step
  checklist (groups and labels come from a static `steps.json` in the package that maps generator
  stage names → human labels + group; unknown stages fall into an "Other" group rather than
  crash), **Review draft** / **Stop this draft**. Step timings are the parsed `stage:` ms.
- **Review** (canvas *Review*): "Waiting for your decision"; side-by-side / draft-only /
  current-only pan-zoom viewer (reuse the Map Sheets viewer from `js/maps.mjs`; both panes share
  one transform), sheet toggle; continents table draft vs current with deltas (top 5 by |Δ land|,
  "Show all"); metrics with the allowed band; **Checks — must pass to accept** = the gates
  `promote-world.mjs` declares in `budgets.json` `promotion.gateRulesThatMustBeGreen` plus
  G-FROZEN, rendered from the dry-run; **Known to-dos** = non-blocking carried debt (G-NET,
  G-CANON-LEG counts); "If you accept": counts from the dry-run WRITE/DELETE list with "See
  every file"; buttons Back / **Reject draft** (reason picker) / **Try another seed** / **Accept
  draft…**.
- **Publish** (canvas *Accept*): Confirm → Publishing → Published crumb. Confirm lists the six
  publish steps and the replace warning; **Accept & publish**. Publishing shows live step status
  from SSE and "You can leave this page"; Published shows seed, sheets redrawn, **Undo this
  publish** (enabled while a matching snapshot exists), **Open Map Sheets**, the new-sheet grid,
  and the "commit through your release workflow" hint. The canvas's "saved as commit a41c09e"
  line is **dropped** (no git commit by decision).
- **History** (new, monitoring): the same Drafts table filtered to all kinds, with duration vs
  target, failures, re-run chains (`rerunOf`) and the "Re-run identical / differs" badge.
  Log viewer per job (tail, follows while running).

Accessibility/UX rules: every action has a text label (no icon-only buttons); all statuses are
words, not colours alone; keyboard reachable; the tab never blocks on the SSE — it falls back to
polling `GET /jobs` every 2 s if the stream drops.

### 7. Monitoring (what "monitoring" means here)

- Every job is a JSON record + log on disk under `build/map-builder/` (gitignored via `build/`).
- Per-step timings for drafts; per-step status for publish; duration vs target on every row.
- Boot recovery: jobs left `queued`/`running` by a killed service become `interrupted` and show a
  Re-run action.
- Re-run determinism badge (§3) turns G-REPRO into something you can see per seed.
- `GET /world` dirty-files warning and branch name make "what would this overwrite" visible
  before publish.

### 8. Error handling & safety

- All script failures are surfaced verbatim (exit code + last stderr lines in `error`, full log
  on disk); the service never swallows a non-zero exit.
- The service refuses to start outside a repo root that has `atelier/mapforge/generate-world.mjs`.
- Publish is serialised (409 on a second publish/undo) and snapshots first; a failed publish
  leaves the snapshot and shows Restore.
- Path handling: job ids and seeds are validated by regex before they touch the filesystem;
  static serving rejects `..` and only serves the mounted roots.
- Bound to 127.0.0.1; no auth by design (single-user local tool). Documented as such.

### 9. Testing

`node --test atelier/map-builder/tests/*.test.mjs` (glob form, as the other atelier suites):

- `stage-parser.test.mjs` — parses real captured `--stage-report` output, ignores noise.
- `jobs.test.mjs` — store round-trip, listing filters, interrupted-on-boot.
- `queue.test.mjs` — concurrency 2, FIFO, cancel queued/running, timeout kill, rerun linkage
  (uses a fake runner that spawns `node -e` sleepers).
- `snapshots.test.mjs` — snapshot → mutate → restore round-trip in a temp repo fixture; retention.
- `api.test.mjs` — real `http` on an ephemeral port with the fake runner: every endpoint's
  success + 400/404/409 paths; SSE delivers `job.step` and `job.done`; publish refuses when dirty
  state conflicts.
- `static.test.mjs` — serves `index.html`, `maps-index.json`, a draft sheet; rejects `..`.
- Storybook: extend `atelier/asset-storybook/tests/` with a read-only-mode render test for the
  tab; the existing SHEETS parity gate stays untouched and must stay green after publish.
- **Gate wiring:** the fast suite above joins `scripts/precheck.sh` (Gate 1); `scripts/integration.sh`
  (Gate 2) gains one real end-to-end: start the service, `POST /jobs` a draft with the real
  generator, wait for `succeeded`, `GET /drafts/:id/review` returns gates, then a `publish` +
  `undo` round trip on a temp copy of the world — both must leave `check_render_lock --check` green.

### 10. Phases (one feature, three plans)

1. **Service + jobs + Start/Build UI.** Package skeleton, config, JobStore, JobQueue, Runner,
   stage parser, `/health /world /jobs* /events`, static serving with the Dockerfile layout, the
   tab with Start + Build screens + read-only mode, tests, Gate 1 wiring, `pnpm map-builder`
   root script. Shippable: you can build and watch drafts from the storybook.
2. **Review + Publish + Undo.** `review.mjs`, `snapshots.mjs`, `/drafts/:id/review`,
   `/decision`, `/publish`, `/snapshots`, `/undo`, Review + Publish screens, Gate 2 end-to-end,
   `docs/diagrams/map-asset-pipeline.drawio` updated to show the builder (it currently shows the
   manual freeze — this feature is the right place to fix it).
3. **Monitoring polish + re-run.** History screen, log viewer, re-run + determinism badge,
   interrupted-on-boot recovery, delete/cleanup of draft dirs, snapshot pruning, docs
   (`atelier/map-builder/README.md`, storybook README section).

### 11. Acceptance criteria (verifiable)

1. `pnpm map-builder` starts one process on 127.0.0.1:6006 (6007 if busy) that serves the
   storybook at `/` and answers `GET /api/health`.
2. From the tab, entering a valid seed and pressing Build produces a `succeeded` draft job whose
   `outDir` contains the generator's six entries, with ≥ 20 parsed steps and a total ≤ the
   generator's own budget; an invalid seed is rejected in the UI and by `POST /jobs` (400).
3. "Drafts at once" = 3 yields three jobs, at most two `running` at any instant.
4. Cancel on a running draft ends it within 6 s with status `cancelled`; a draft exceeding
   its timeout ends `failed · took too long`.
5. Review shows draft-vs-current sheets, per-continent deltas, sea:land vs the band, the
   promotion gates from the dry-run, and the WRITE/DELETE counts.
6. Publish replaces the frozen world with the draft, redraws all `SHEETS`, rewrites the render
   lock, and leaves `check_render_lock --check`, `check_content.mjs`, the SHEETS parity gate and
   `node --test atelier/mapforge/tests/*.test.mjs` green; `content/world/manifest.json` seed
   equals the draft's.
7. Undo restores every file in the snapshot byte-for-byte (sha256 match) and leaves the same
   gates green.
8. Killing the service mid-draft and restarting marks the job `interrupted`; Re-run produces a
   draft with `rerunMatch: "identical"` for the same seed.
9. Under nginx / `http.server` the tab renders the read-only notice and no action buttons.
10. All new tests pass in Gate 1; the end-to-end passes in Gate 2; no new runtime dependency is
    added to any package.json.

### 12. Non-goals

Git commits or branches from the service; running on k8s or remotely; auth or multi-user;
draft PNG rasterisation; Prometheus/Grafana; editing world content by hand in the UI; changing
generator or promotion semantics (they are called as-is; the only permitted generator change is
a `--json-report` flag if the plan finds `report.md` does not carry sea:land and counts).

### 13. Assumptions to verify in the plan

- The storybook's static URL layout (`/content/…`, `/build/mapforge/…`, `/game-client/…`) is
  exactly what `atelier/asset-storybook/Dockerfile` publishes; the service mirrors it.
- The draft's `report.md` / `manifest.json` carry sea:land and settlement/landform/region counts;
  if not, add `--json-report` (see non-goals) rather than parsing prose.
- `promote-world.mjs` step 4 renders SVG only; PNGs still need `render-sheet.mjs --png` per sheet.
- `maps-index.json` has a generating script; if it is hand-maintained today, publish step 4
  writes it from `SHEETS` and the parity gate proves it.

### Adjacent, filed, not in scope

- `atelier/asset-storybook/index.html` ~L1025–1032 `.maps-overlay-img` rule is missing a `}`.

## Audit trail

- 2026-09-13 batch-grill: four decisions, all defaults accepted by owner (see Decisions).
- self-grill-audit: pending.
