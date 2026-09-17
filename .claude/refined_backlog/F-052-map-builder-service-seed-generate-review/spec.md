---
title: "Map builder service: seed → generate → review → accept into storybook, with monitoring + re-run"
id: F-052
status: refined
date: 2026-09-13
from_idea: I-121
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
  snapshot** — keeps git writes out of the service. The ps-release-workflow guard is a Claude
  hook and does not see a node child process, so the service enforces the same rule itself:
  publish and undo are refused when the checkout is on `main` or detached.
- Monitoring → **in-app: job list, per-step progress, logs, timings, run history, persisted as
  JSON** — survives restarts; no Prometheus in this feature.
- Delivery → **one feature, three phased plans** — each phase shippable on its own.
- Runtime (default, not asked) → Node built-in `http` only, no framework dependency — matches the
  dependency-free `node --test` convention of every other atelier package.
- Concurrency (default) → 2 drafts at once, configurable — the canvas copy already says so.
- Bind (default) → `127.0.0.1` only, port **6016** (6006 is the k8s storybook port-forward in
  `scripts/deploy-local.sh`; a silent fallback repeats the F-044 stale-server trap). If the port
  is busy the service exits with a clear message; `--port` overrides. Printed on start.
- Draft location (default) → `build/mapforge/<seed8>-<version>/` exactly as the generator's own
  `runIdOf` (first 8 hex of the seed) — nothing new to gitignore. One active job per out dir.
- Start command (default) → `node atelier/map-builder/server.mjs`; there is no root
  `package.json` and atelier is not a pnpm workspace package, so no `pnpm` script is added.

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
browser ── GET /            ──▶ 302 → /atelier/asset-storybook/index.html  (document root = repo root,
        ── GET /<repo-relative path>   exactly as k8s/local/storybook-nginx.conf; maps.mjs prefixes ../../)
        ── GET/POST /api/*  ──▶ server.mjs ─▶ JobQueue ─▶ Runner (child_process.spawn)
        ── GET /api/events  ◀── SSE: job.created / job.step / job.done / world.changed
                                 │
                                 ├─ build/map-builder/jobs/<id>.json + <id>.log   (persisted)
                                 ├─ build/map-builder/snapshots/<ts>-<seed>/      (pre-publish)
                                 └─ build/mapforge/<seed>-<ver>/                  (drafts)
```

One process, started with `node atelier/map-builder/server.mjs` from the repo root.
The storybook tab is a normal storybook module (`atelier/asset-storybook/js/map-builder.mjs`)
mounted from `js/main.mjs` like `mountMaps`. When `GET /api/health` fails (nginx, k8s, plain
`http.server`) the tab renders a read-only notice: "Builder service not running — start it with
node atelier/map-builder/server.mjs`" and hides every action.

### 2. Components (all under `atelier/map-builder/`)

| Unit | Does | Depends on |
|---|---|---|
| `server.mjs` | http server; static file serving with document root = repo root and the nginx conf's `/` redirect; routes `/api/*`; SSE fan-out | `lib/*` |
| `lib/jobs.mjs` | JobStore: create/read/list/update job records as JSON files; log file append; survives restart (queued/running jobs found on boot are marked `interrupted`) | fs |
| `lib/queue.mjs` | JobQueue: FIFO with concurrency N (default 2), per-kind timeouts, cancel | JobStore, Runner |
| `lib/runner.mjs` | Runs one job kind as spawned script(s); streams stdout/stderr to the log; parses `stage:` lines into steps | child_process |
| `lib/stage-parser.mjs` | Pure parser for `generate-world.mjs --stage-report` output: `stage: <name> <label> <ms> ms` where names are `P1`…`P14w` and labels like `premise-masks` (18 distinct stages; loop stages such as P11/P11b re-emit, shown as "ran N×"), plus the unconditional `stage: generate TOTAL … (budget …, fail …)` summary line, which it must recognise and not treat as a step | — |
| `lib/world.mjs` | Reads the current world: **seed of record from `content/world/fabric/world.json`** (promotion replaces the fabric family; `content/world/manifest.json`'s seed is a byte copy of the committed file and never changes), the allowed sea:land band from `manifest.json` `ratio.min/max`, sheet list from `render-sheet.mjs`'s `SHEETS`, render-lock state, git branch + dirty world files (read-only `git` queries) | fs, git (read-only) |
| `lib/review.mjs` | Builds the review payload for a draft: metrics from the draft's JSON report, per-continent deltas draft vs current, the dry-run WRITE/DELETE list + ratio, sheet URLs. No gate results — see §3 | world.mjs, promote dry-run |
| `lib/snapshots.mjs` | Snapshot/restore of the frozen world file set, **computed** from the writers (§5), never a hand list; keeps the last 3 | fs |
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
  "targetMs": 6000, "timeoutMs": 40000,   // budgets.json loop rows the job runs: Σ budgetMs / 2 × Σ failMs (see timeouts)
  "steps": [ { "name": "roads", "label": "Roads", "ms": 390, "status": "done" }, … ],
  "outDir": "build/mapforge/3f81c0aa9d2e5b17-3.0.0",
  "exitCode": 1, "error": "loop budget exceeded in settlements",   // failed only
  "rerunOf": "j_…",                        // set by /rerun
  "rerunMatch": "identical" | "differs" | null,   // draft re-runs: manifest hash compare
  "metrics": { "seaLand": 1.52, "landKm2": 63500, "settlements": 212, "landforms": 41, "regions": 44 },  // from the draft's JSON report
  "review": { "decision": "accepted" | "rejected" | null, "reasons": ["too much sea"], "at": "…" }
}
```

**Job kinds → commands** (exact flags verified against the scripts, 2026-09-13):

- `draft` → `node atelier/mapforge/generate-world.mjs --seed <s> --out build/mapforge/<seed8>-<ver> --no-png --stage-report --json-report`; then `node atelier/mapforge/promote-world.mjs --dry-run --from <out>` to capture the WRITE/DELETE list, `ratio` and `landKm2`. **The dry-run returns before derive, render and the content gate** (`promote-world.mjs` returns at the `dryRun` check), so it yields no gate results; promotion gates only exist for a promoted tree and therefore run inside `publish` (below). `--json-report` is a small, in-scope generator change: today `runManifest` carries `seaToLandRatio`/`landKm2` but no settlement/landform/region totals and `report.md` is prose; the flag writes `report.json` with those totals per world and per continent. Fails on non-zero exit; the generator's own refusals (bad seed, foreign files in `--out`, loop-budget overrun past `failMs`) surface verbatim in the log and the `error` field.
- `dry-run` → the second half of `draft`, runnable alone from the review screen ("Re-check").
- `publish` (composite, one job, six steps mirroring the canvas Accept board) →
  1. snapshot the frozen world (§5);
  2. `promote-world.mjs --from <out>` (this already runs `check_spine_emit --write`, renders, and runs the content gate; **a red promotion gate here fails the job and the service restores the snapshot automatically**, so "Checks — must pass to accept" is enforced at publish time, not previewed);
  3. `render-sheet.mjs --sheet <id> --png` for every id in `SHEETS` (17 today);
  4. rebuild `atelier/asset-storybook/maps-index.json` the way the existing storybook build does (the plan names the script; the SHEETS parity gate must stay green);
  5. `scripts/check_render_lock.mjs --write`;
  6. verify: `check_render_lock.mjs --check` exits 0, `scripts/check_spine_emit.mjs` (check mode) exits 0, and the seed in `content/world/fabric/world.json` equals the draft seed.
  Any step failing stops the job, marks it `failed`, and offers "Restore snapshot" in the UI.
- `undo` → restore the named snapshot, then `check_render_lock.mjs --check`; world.changed event.

Timeouts: the generator already enforces `content/world/budgets.json` per row (`generate` 6 s budget / 12 s fail, `sheets` 5 s / 8 s) and exits 1 past `failMs` — that exit is the "took too long" signal and the UI's 6 s target / 12 s stop marks come from those rows. The service's own timeout is only a backstop against a hung child: `draft` = 2 × Σ `failMs` of the rows the job runs (generate + sheets = 40 s); `publish` = 2 × Σ `failMs` of every row (about 240 s). On backstop timeout the child is killed (SIGTERM, then SIGKILL after 5 s) and the job is `failed` with `error: "hung"`. Note the F-051 measurement recorded in budgets.json: `failMs` is wall-clock and inflates 3–4× under CPU contention, so the default concurrency of 2 is the maximum the budgets tolerate; the config caps it at 2.

Cancel: `POST /api/jobs/:id/cancel` on a queued job removes it; on a running `draft` it kills the child. `publish` cannot be cancelled after step 2 starts (the world is mid-replace); the UI disables the button and says why.

Re-run: `POST /api/jobs/:id/rerun` clones `kind`, `seed`, `reason` into a new job with `rerunOf` set. For a `draft`, the generator's `clearRun()` wipes its own six entries in the same out dir, so the re-run overwrites in place — the queue therefore refuses (409) a re-run while another job for the same out dir is queued or running; on completion the service compares the new `manifest.json` hashes with the ones recorded on the original job and stores `rerunMatch` — a live G-REPRO check surfaced as a badge ("Re-run identical" / "Re-run differs").

### 4. HTTP API (`/api`, JSON, local only)

| Method + path | Purpose |
|---|---|
| `GET /health` | `{ ok, version, pid, repoRoot, branch }` — the tab's live/read-only switch |
| `GET /world` | current seed (from `fabric/world.json`), sea:land + allowed band (`manifest.json` `ratio`), sheet count + lock state, branch, dirty world files (warning), `publishAllowed` + reason, last publish |
| `GET /jobs?kind=&status=&seed=&limit=` | history, newest first |
| `POST /jobs` | `{ kind:"draft", seed, reason, count }` → enqueues `count` draft jobs. With no seed given, each job gets a distinct random seed; with a typed seed, `count` is forced to 1 (a re-run of the same seed is a separate action, §3) |
| `GET /jobs/:id` · `GET /jobs/:id/log` | record; raw log (text/plain, supports `?tail=200`) |
| `POST /jobs/:id/cancel` · `POST /jobs/:id/rerun` · `DELETE /jobs/:id` | as §3; DELETE also removes the draft dir, never a snapshot |
| `GET /drafts/:jobId/review` | review payload (§6): metrics, continent deltas, WRITE/DELETE list, sheet URLs — no gate results |
| `POST /drafts/:jobId/decision` | `{ decision:"rejected", reasons:[…] }` — records only; rejecting keeps the draft dir until deleted |
| `POST /publish` | `{ draftJobId, confirm:true }` → enqueues a `publish` job; refuses (409) if another publish/undo is queued or running, **or if the checkout is on `main` / detached** (direct commits to main are forbidden by the branching rules and the Claude-side guard cannot see a node process) |
| `GET /snapshots` · `POST /undo` | list; `{ snapshotId }` → enqueues `undo` (same branch refusal as publish) |
| `GET /events` | SSE stream of `job.*` and `world.changed`; the tab reconnects with `Last-Event-ID` |

Errors are `{ error: { code, message } }` with 400 (validation), 404, 409 (state conflict), 500.
Seed validation is the generator's own regex `^[0-9a-f]{16}$`; random seeds come from
`crypto.randomBytes(8).toString("hex")`.

### 5. Snapshot & undo (the "no git commit" contract)

Before `publish` step 2 the service copies the **frozen world file set** to
`build/map-builder/snapshots/<ISO-ts>-<currentSeed>/`. The set is **computed, not hand-listed**,
as the union of what the publish writers touch: promote's `toCopy` (`content/spine/nodes/*`,
`content/spine/edges.json`, the `REPLACED_FAMILIES` `content/world/{fabric,handles,resolved}/`),
spine-emit's outputs (`content/spine/derived.json`, `content/maps/atlas-frontier.md`,
`colyseus-server/src/config/generated/mapDimensions.ts`), `content/world/render-lock.json`,
`game-client/assets/art/maps/`, and `atelier/asset-storybook/maps-index.json`. Those two lists
are exported from `promote-world.mjs` / `check_spine_emit.mjs` (or read from a shared JSON) so
a new writer cannot silently fall outside the snapshot; the Gate 2 end-to-end asserts that the
set of files changed by a real publish ⊆ the snapshot set. The snapshot carries a `snapshot.json` (seed, time, file count, sha256 per file). Undo is a pure
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
  checklist (groups and human labels come from a static `steps.json` in the package keyed by the
  generator's stage names `P1`…`P14w`; unknown stages fall into an "Other" group rather than
  crash; a stage that re-emits shows "ran N×"). "Step k of N" uses N = distinct stages in
  `steps.json` (18 today), not a hard-coded 20. **Review draft** / **Stop this draft**. Step
  timings are the parsed `stage:` ms.
- **Review** (canvas *Review*): "Waiting for your decision"; side-by-side / draft-only /
  current-only pan-zoom viewer (reuse the Map Sheets viewer from `js/maps.mjs`; both panes share
  one transform), sheet toggle; continents table draft vs current with deltas (top 5 by |Δ land|,
  "Show all"); metrics with the allowed band; **Checks — run when you accept** = the gates
  `promote-world.mjs` declares in `budgets.json` `promotion.gateRulesThatMustBeGreen` (G-ALIAS,
  G-PARENT, G-TOWN-FRAME, G-FROZEN today), listed by name with the copy "checked during publish;
  a failure restores the current world automatically" — they cannot be previewed because the
  dry-run stops before the gate; **Known to-dos** = non-blocking carried debt (G-NET,
  G-CANON-LEG counts from the current world's last gate report); "If you accept": counts from the dry-run WRITE/DELETE list with "See
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
- `GET /world` dirty-files warning, branch name and `publishAllowed` make "what would this
  overwrite, and may I" visible before publish.

### 8. Error handling & safety

- All script failures are surfaced verbatim (exit code + last stderr lines in `error`, full log
  on disk); the service never swallows a non-zero exit.
- The service refuses to start outside a repo root that has `atelier/mapforge/generate-world.mjs`.
- Publish is serialised (409 on a second publish/undo), refused on `main`/detached HEAD, and
  snapshots first; a red promotion gate or any failed step restores the snapshot automatically
  and the UI shows what failed.
- Path handling: job ids and seeds are validated by regex before they touch the filesystem;
  static serving rejects `..` and only serves the mounted roots.
- Bound to 127.0.0.1; no auth by design (single-user local tool). Documented as such.

### 9. Testing

`node --test atelier/map-builder/tests/*.test.mjs` (glob form, as the other atelier suites):

- `stage-parser.test.mjs` — parses real captured `--stage-report` output (P-names, labels,
  repeated loop stages, the TOTAL summary line), ignores noise.
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
  generator, wait for `succeeded`, `GET /drafts/:id/review` returns metrics + WRITE/DELETE
  counts, then a `publish` + `undo` round trip on a temp feature branch — both must leave
  `check_render_lock --check` and `check_spine_emit` green, and the files a publish changed
  must all be inside the snapshot set.

### 10. Phases (one feature, three plans)

1. **Service + jobs + Start/Build UI.** Package skeleton, config, JobStore, JobQueue, Runner,
   stage parser, the `--json-report` generator flag, `/health /world /jobs* /events`, static
   serving mirroring `storybook-nginx.conf`, the tab with Start + Build screens + read-only mode,
   tests, Gate 1 wiring. Shippable: you can build and watch drafts from the storybook.
2. **Review + Publish + Undo.** `review.mjs`, `snapshots.mjs`, `/drafts/:id/review`,
   `/decision`, `/publish`, `/snapshots`, `/undo`, Review + Publish screens, Gate 2 end-to-end,
   `docs/diagrams/map-asset-pipeline.drawio` updated to show the builder (it currently shows the
   manual freeze — this feature is the right place to fix it).
3. **Monitoring polish + re-run.** History screen, log viewer, re-run + determinism badge,
   interrupted-on-boot recovery, delete/cleanup of draft dirs, snapshot pruning, docs
   (`atelier/map-builder/README.md`, storybook README section).

### 11. Acceptance criteria (verifiable)

1. `node atelier/map-builder/server.mjs` starts one process on 127.0.0.1:6016 that redirects `/`
   to the storybook exactly as nginx does, serves repo-relative assets, and answers
   `GET /api/health`; a busy port exits non-zero with a message.
2. From the tab, entering a valid seed and pressing Build produces a `succeeded` draft job whose
   `outDir` contains the generator's six entries plus `report.json`, with every distinct stage
   in `steps.json` parsed and a total within the generator's own `failMs`; an invalid seed is rejected in the UI and by `POST /jobs` (400).
3. "Drafts at once" = 3 yields three jobs, at most two `running` at any instant.
4. Cancel on a running draft ends it within 6 s with status `cancelled`; a draft the generator
   aborts past `failMs` ends `failed · took too long` with the generator's message; a hung child
   ends `failed · hung` at the backstop.
5. Review shows draft-vs-current sheets, per-continent deltas, sea:land vs the band from
   `manifest.json`, the WRITE/DELETE counts from the dry-run, and the named publish-time gates.
6. Publish replaces the frozen world with the draft, redraws all `SHEETS`, rewrites the render
   lock, and leaves `check_render_lock --check`, `check_content.mjs --only=spine`, the
   spine-emit drift check and the SHEETS parity gate green; the seed in
   `content/world/fabric/world.json` equals the draft's; a publish attempted on `main` is
   refused with 409 and changes nothing. Precision on "green" (final review I2): the
   builder itself keeps `check_render_lock --check`, `check_content.mjs --only=spine`, the
   spine-emit drift check and the SHEETS parity gate green after every publish; the bare
   `check_content.mjs` run and the mapforge suite validate the CURRENTLY-COMMITTED seed's
   specific values (its ratio, coastline vertex count, zone/spine bindings), so they
   legitimately go red immediately after any real publish that changes the seed and return
   green after undo — or stay green only if the new seed's own values happen to satisfy
   them, which is not guaranteed and is downstream content work, not a publish defect.
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
the `--json-report` flag, which is required — §3).

### 13. Assumptions to verify in the plan

- `promote-world.mjs` step 4 renders SVG only; PNGs still need `render-sheet.mjs --png` per sheet.
- `check_spine_emit.mjs` has (or gains) a check-only mode usable in publish step 6.
- `maps-index.json` has a generating script; if it is hand-maintained today, publish step 4
  writes it from `SHEETS` and the parity gate proves it.

### Adjacent, filed, not in scope

- `atelier/asset-storybook/index.html` ~L1025–1032 `.maps-overlay-img` rule is missing a `}`.
- `content/world/manifest.json` `seed` is a byte copy that promotion never updates, so it no
  longer names the frozen world (`fabric/world.json` does). Worth a one-line fix in the generator
  or a note in the manifest, outside this feature.

## Audit trail

- 2026-09-13 batch-grill: four decisions, all defaults accepted by owner (see Decisions).
- 2026-09-13 self-grill-audit: verdict safe-with-fixes. Corrected: dry-run yields no gate
  results (gates run at publish with auto-restore); seed of record is `fabric/world.json`;
  snapshot set computed from promote `toCopy` + spine-emit outputs (adds `edges.json`,
  `atlas-frontier.md`, `mapDimensions.ts`); timeouts from Σ `failMs` with the generator's own
  exit as the signal; port 6016 with no silent fallback; no root `package.json` → plain
  `node` start; static layout mirrors `storybook-nginx.conf` (repo root + 302); publish/undo
  refused on `main`; stage grammar `P1…P14w` (18 stages, loops re-emit, TOTAL line); metrics
  need `--json-report` and the band lives in `manifest.json ratio`; out dir is `<seed8>-<ver>`
  with one active job per dir; dropped redundant "plus G-FROZEN". Open: none.
