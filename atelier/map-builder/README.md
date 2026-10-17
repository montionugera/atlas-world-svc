# map-builder — seed → generate → review → publish → undo

A small local HTTP service that drives the mapforge world generator from the
asset-storybook's **Map Builder** tab: type (or roll) a seed, watch the draft
build stage by stage, review the draft against the current world, publish it
(with an automatic snapshot), and undo. Nothing here touches git — see
"Snapshot / undo contract" below.

Spec: [`.claude/refined_backlog/F-052-map-builder-service-seed-generate-review/spec.md`](../../.claude/refined_backlog/F-052-map-builder-service-seed-generate-review/spec.md)
(F-052). Plan and per-task reports: `.superpowers/sdd/plan/`.

## Start

```bash
node atelier/map-builder/server.mjs            # from the repo root
# then open
open http://127.0.0.1:6016/atelier/asset-storybook/index.html
```

`GET /` redirects to the storybook; `GET /api/health` reports the version, pid,
repo root and branch. Flags: `--port <n>`, `--bind <host>` (default
`127.0.0.1`, loopback only — non-loopback binds are opt-in), `--repo-root <dir>`,
`--data-dir <dir>`, `--concurrency <n>`. Defaults live in `config.json`
(`port`, `bind`, `concurrency`, `maxConcurrency`, `snapshotKeep`,
`killGraceMs`, `pollMs`). There is no root `package.json` script for it.

The service serves the storybook's static files itself (`lib/static.mjs`),
so one process gives you both the UI and the API on the same origin.

## Job model

Every action is a **job**: a JSON record + a log file, run through a FIFO
queue (`lib/queue.mjs`, at most `concurrency` drafts at once). `lib/commands.mjs`
maps each kind to the commands it runs, all as child processes with
`cwd = repoRoot`:

| kind | what runs | notes |
| --- | --- | --- |
| `draft` | `generate-world.mjs --seed S --out build/mapforge/<runId> --no-png --stage-report --json-report`, then `promote-world.mjs --dry-run --from <out>` | the only kind that produces a review; out dir is deterministic per seed + generator version |
| `dry-run` | `promote-world.mjs --dry-run --from <out>` | re-reads an existing draft dir; writes nothing |
| `publish` | snapshot → promote → render sheets → parity → render lock → verify (`lib/publish.mjs`) | composite; exclusive — refused while any other job is queued or running, and vice versa |
| `undo` | restore a snapshot → check | composite; same exclusivity as publish |

Statuses: `queued → running → succeeded | failed | cancelled | interrupted`.
A running publish/undo can never be cancelled (409) — killing one mid-way
would leave a half-replaced world; a failed publish restores its own snapshot
before it goes terminal.

Routes (`lib/app.mjs`), all under `/api`:

| route | purpose |
| --- | --- |
| `GET /world`, `GET /steps`, `GET /health` | current seed / ratio / branch / dirty files / `publishAllowed` / `undoAvailable`; the stage list; liveness |
| `GET /jobs?kind=&status=&seed=&limit=` · `GET /jobs/:id` · `GET /jobs/:id/log?tail=N` | history (newest first), one record, its log |
| `POST /jobs {kind, seed \| count, reason}` | start 1–4 drafts (or a dry-run) |
| `POST /jobs/:id/cancel` · `POST /jobs/:id/rerun` · `DELETE /jobs/:id` | cancel; re-run a draft/dry-run (any finished status, incl. interrupted); delete a finished record |
| `DELETE /jobs?status=failed,cancelled,interrupted&olderThanDays=N` | bulk cleanup of finished-not-succeeded records, logs and draft dirs (never snapshots, never active or succeeded jobs) → `{ deleted, ids }` |
| `GET /drafts/:id/review` · `POST /drafts/:id/decision {decision, reasons}` | review payload for a succeeded draft; record accept/reject |
| `POST /publish {draftJobId, confirm: true}` · `GET /snapshots` · `POST /undo {snapshotId}` | publish a reviewed draft; list snapshots; restore one |
| `GET /events` | SSE: `job.created` / `job.started` / `job.step` / `job.done` / `world.changed` (the UI polls `GET /jobs` every 2 s if the stream drops) |

POST/DELETE must send `Content-Type: application/json`; requests whose `Host`
or `Origin` is not loopback (or the configured bind) are refused with 403.

## Where data lives

Everything is under `build/map-builder/` (gitignored via `build/`; override with
`--data-dir`):

- `jobs/<id>.json` — the record; `jobs/<id>.log` — every line the commands
  wrote, prefixed `[label]`.
- `snapshots/<id>/` — one full copy of the publish set per publish
  (`lib/snapshots.mjs`), pruned to `snapshotKeep` newest after each success.

Draft output itself goes to `build/mapforge/<runId>/` (the generator's own
convention); publish copies it into `content/` and `game-client/assets/art/maps/`.

## Snapshot / undo contract

- **No git commit, ever.** Publish rewrites the working tree; committing
  `content/world/`, `content/spine/` and `game-client/assets/art/maps/` is your
  release workflow's job. The Published screen says so.
- **Publish is refused on `main`** (and on a detached HEAD) with 409 — work on
  a feature branch. It is also refused while `scripts/` deps are missing
  (promote runs `check_content`).
- **Every publish snapshots first.** The snapshot is the exact file set the
  publish will replace (`snapshotSet`), hashed; a failure at any later step
  restores it automatically before the job goes terminal. If the restore
  itself fails, the record carries `restored: false` + `restoreError` and the
  UI offers "Undo from snapshot" by id.
- **Undo = restore a snapshot + check.** `world.undoAvailable` is true while a
  readable snapshot exists that would actually change something — i.e. one
  not already put back by an undo's restore step and not the snapshot of a
  publish that auto-restored (`lib/world.mjs`). An interrupted publish, or one
  whose auto-restore failed, keeps its snapshot counted — that is exactly
  when you need it. The Published crumb shows how many snapshots are kept.
- A draft accepted for publish is marked `accepted`; if the publish fails,
  is cancelled while queued, or is interrupted, the draft is reopened for
  review (`reopenDraft` / `recoverInterrupted`).

## Monitoring

- **Records + logs** per job (above). The History screen lists every kind
  with duration vs the draft target (6 s, from `content/world/budgets.json`),
  re-run chains, and a Log viewer that tails the log every second while the
  job runs.
- **Interrupted recovery.** On boot, any record left `queued`/`running` by a
  killed service becomes `interrupted` (`error: "service restarted"`) and
  offers Re-run. A publish interrupted after its snapshot step shows "the
  world may be half-published" with the snapshot to undo from.
- **Re-run determinism badge.** A succeeded draft stores its
  `manifest.json` hashes (`manifestHashes`); a re-run (`rerunOf`) compares its
  own and records `rerunMatch: "identical" | "differs"` plus `rerunDiff` (the
  files whose hash changed) — a live G-REPRO check shown as "Re-run identical /
  differs" in History.
- **Timeouts.** A draft is killed after 2 × (generate + sheets fail budget); a
  publish/undo after 2 × the sum of all loop budgets (`lib/repo.mjs`): SIGTERM,
  then SIGKILL after `killGraceMs`. A killed run records `error: "hung"`.

## Troubleshooting

- **`port 6016 is busy`** — another builder is running (or a stale one).
  Start with `--port <n>`, or find it: `lsof -nP -iTCP:6016 -sTCP:LISTEN`.
- **"rsvg-convert not found — PNG skipped"** — publish still succeeds (SVG
  sheets update, PNGs don't) and the step carries a warning; `brew install
  librsvg` to restore PNGs. The Publish screen warns before you confirm when
  `world.pngTool` is false.
- **"Failed · took too long" vs "Failed · hung"** — *took too long* is the
  generator's own loop budget (`LOOP BUDGET` on stderr, exit 1): the seed is
  expensive, try another. *Hung* is the service's timeout killing a process
  that stopped reporting: check the log tail for the last `[generate]` line,
  and whether the machine was swapping.
- **"a publish or undo is queued or running"** on starting a draft — wait for
  it; the world it reads is being replaced.
- **Storybook says "Builder service not running"** — the tab probes
  `/api/health` with a 2 s timeout; you are on a read-only serve (nginx or
  `python3 -m http.server`) or the service is down.
- **Publish refused on main / deps missing** — see the contract above.

## Tests

```bash
node --test atelier/map-builder/tests/*.test.mjs                        # unit + API (fake repo, fake tools)
node --test atelier/asset-storybook/tests/map-builder-model.test.mjs     # the tab's view-model
REPO_ROOT=$PWD bash atelier/map-builder/tests/e2e/publish-undo.sh        # real draft → publish → undo
```

The unit suite is Gate 1 (`scripts/precheck.sh`, "map-builder: node --test
suite"). The e2e is Gate 2 (`scripts/integration.sh`, "map-builder: draft →
publish → undo end-to-end"): it runs the **real** tools against a **throwaway
git worktree** of the repo, never the caller's tree — it needs `rsvg-convert`
and `npm ci --prefix scripts`. Never point a manual publish at a shared dev
server's checkout for the same reason (it rewrites ~90 tracked files).
