---
title: "Atlas web app in local k8s deployed via release: images and Game DB"
id: I-246
status: idea
---

# Atlas web app in local k8s deployed via release: images and Game DB

Status: owner-approved 2026-11-01 with every default. Not refined yet.

## Goal
`atlas-world.joymify.local.com` always shows exactly what the last release shipped, from a cluster workload, so an image or game-data change lands through the normal release flow and never depends on which checkout holds a port.

The user will confirm this by opening `http://atlas-world.joymify.local.com/?tab=concept-arts` after a release deploy and seeing the shipped art, with the top bar reading "Read-only · 1.19 · <commit>".

## Why now
On 2026-11-01 port 8788 was held by a process from worktree `inc-as-3` and served old art: boss image md5 `99fbdd11...` against the shipped `00c6a969...`. Nothing warned that the page was stale.

## Meaning of "Atlas Game DB"
Owner answer, 2026-11-01: the existing studio, whose sidebar reads "Atlas World DB". Its data is `build/catalog.sqlite`, built by `scripts/build_catalog_db.py` from `contracts/content` and `content/`, with panels on top.

## Non-goals
- No new website and no new database server.
- No editing in the cluster. Editing stays on the Mac host process, reached at `http://atlas-edit.joymify.local.com/` from any device.
- No auth. It stays a local-only surface.
- No production deployment.
- No change to `psrw` itself.

## Users & jobs
The owner opens the app by name, often from an iPad, to review art and game data after a release, and sometimes to mark verdicts. Agents use the same URL to check what shipped.

## What is true today
- `scripts/deploy-local.sh` builds `server-rs` and `nakama` from the working tree, with `:local` tags, `imagePullPolicy: Never` and `roll()`. The web surface is a host process.
- `k8s/local/ingress.yaml` sends `atlas-world.joymify.local.com`, `atlas.joymify.local.com` and `atlas-world.joymify.local` to `atlas-world-studio-host`, whose Endpoints point at the Mac on 8788. iPads and other Tailscale devices reach it only this way.
- The root `.dockerignore` excludes `scripts/`, `atelier/`, `game-client/`, `tools/`, `content/studio` and `content/world`, so a separate ignore file is needed.
- `build_catalog_db.py` skips missing inputs and exits 0.
- `scripts/catalog_explorer_web.py` has 14 POST routes plus `/api/map-builder/` POST and DELETE; `web_routes.dispatch` runs before `do_POST`. Map Builder needs a loopback service on 6016.
- `psrw ship` prompts on a terminal, and only warns if the deploy fails (`ship_current_work_to_release.py:465-499`).

## Design
**One image, same server, read-only mode.** New `Dockerfile.atlas-web`, `Dockerfile.atlas-web.dockerignore`, and `k8s/local/atlas-world-web.yaml` (Deployment with one replica, a readiness probe on `/healthz`, and a Service), using `atlas-world-web:local` and `imagePullPolicy: Never`, tagged with the commit as well.

**Build from the commit.** The image builds from a `git archive` export of HEAD, so uncommitted and ignored files can't enter it. If the export fails, the deploy exits non-zero. A deploy from any branch other than the current `release/<v>` skips this image with a printed warning.

**Contents.** `scripts/`, `contracts/content`, `content/`, `tools/mac-observatory/` (theme and vendor files), `docs/superpowers/specs`, every `MOUNT_DIRS` and `MOUNT_FILES` entry in `scripts/atlas_world_web/static_mounts.py`, all of `game-client/assets`, and `build/catalog.sqlite` built during the image build. A test fails if a mount entry is missing from the image and not on the exclusion list. The exclusion list has one tab: Map Builder.

**Catalog check.** The build fails if a required input is absent, or if `world_continents` or `v_mob_economy` has 0 rows. While read-only, the server never rebuilds the catalog.

**Read-only flag.** `ATLAS_READ_ONLY=1` adds one check as the first statement of `do_POST` and `do_DELETE`, before `web_routes.dispatch`. It answers `403 {"ok": false, "error": {"code": "read_only", "message": "..."}}`, the existing error shape. `/api/sql` stays, because it is already read-only.

**Hidden controls.** The server sets `body[data-read-only]`, so nothing flashes. Hidden: Rebuild SQLite, Balance Sim, review verdict, asset verdict marks, palette toggle, studio undo, AI edit, map structure editor, launch-3d, rationale update, generate-children, map layers save, forge work orders, Map Builder publish and delete. A test walks this list.

**Stale tabs.** All write callers go through one helper that checks `res.ok` before any success text. On `read_only`, `#topbarStatus` (now `role="status"`) reads "Not saved: this is a read-only release page. Reload to see the current release." VerdictSync treats it as final and stops retrying.

**Version.** `/api/runtime` returns `{"readOnly": true, "release": "1.19", "commit": "<full sha>"}`, baked in at build time, or `{"readOnly": false, "release": null, "commit": null}` on the host. The page awaits it before first render. `#topbarStatus` rests at "Read-only · 1.19 · <7-char commit>", visible at 390px and with the sidebar collapsed; `.sidebar-footer` shows the same. The read-only line links to `http://atlas-edit.joymify.local.com/`.

**Thumbs and caches.** While read-only, thumbnails resolve in strict mode, so a missing one shows the placeholder, never a substitute. The server answers it as a plain SVG with `X-Thumb-Missing: 1`; an explicit `strict=1` still gets 404. `/thumbs/` and `/vendor/` use `Cache-Control: no-cache` plus ETag, so old art can't survive a release.

**Routing.** The three existing hostnames move to the new Service. `atlas-world-studio-host` stays and gets a new hostname, `atlas-edit.joymify.local.com`, so iPad review, verdicts and work orders keep working. If the host process is down, that hostname shows nginx's bad gateway, and `README.md` gives the start command. The `atlas-storybook` redirect stays as it is.

**Deploy and check.** `deploy-local.sh` builds the image, applies the manifest, reuses `roll()`, then runs new `scripts/verify-atlas-web.sh`. It retries for 60s, then requires `/api/runtime` to match `.release.json` and `git rev-parse HEAD`, compares a served concept-art md5 with `git show HEAD:<path>`, and compares a `/api/sql` count with a catalog built from HEAD. It exits non-zero naming both commits, or "unreachable" with the curl error.

**Slices.** 1: image and read-only mode, running by port-forward, with size measured. 2: manifest and ingress switch, plus `atlas-edit`. 3: deploy wiring and the check.

## Requirements
- R1. When `deploy-local.sh` finishes on the release branch, the hostname shall serve that commit.
- R2. If the served commit or data differs, or the host is unreachable after 60s, then `verify-atlas-web.sh` shall exit non-zero and `deploy-local.sh` with it.
- R3. While `ATLAS_READ_ONLY=1`, the server shall answer 403 to every POST and DELETE, including unknown paths.
- R4. If the flag is unset, then all existing behaviour shall stay the same, and `/api/runtime` shall return `readOnly: false`.
- R5. While read-only, the UI shall hide every listed control, and no write action shall show success text.
- R6. When a tab is on the exclusion list, it shall show "Not in this release image. Open the edit site." with a link, and shall request no missing file.
- R7. If a required input is absent or a core table is empty, then the image build shall fail.
- R8. When the pod restarts, the app shall serve the same data with nothing to set up.
- R9. When the Mac host process runs, `atlas-edit.joymify.local.com` shall reach it with writes working.

## Acceptance criteria
- [ ] Given a fresh deploy, when `curl -sL -o /dev/null -w '%{url_effective} %{http_code}' http://atlas-world.joymify.local.com/` runs, then it ends on that host with 200 and no port.
- [ ] Given an uncommitted image edit in the deploying checkout, when the deploy runs, then the hostname serves the committed file's md5.
- [ ] Given a build context with `content/world` removed, when the image builds, then it exits non-zero.
- [ ] Given read-only mode, when a table-driven test POSTs each write route, `/api/not-a-route` and `/api/map-builder/x`, and DELETEs `/api/map-builder/x`, then each answers 403 and a hash of the tree is unchanged.
- [ ] Given the running pod, then `/theme.css` contains `joy-spatial-shell`, and `/vendor/ol.js` and `/vendor/model-viewer.min.js` answer 200.
- [ ] Given a real-mouse pass over every tab in Chrome, then there is no uncaught exception, no failed request and 0 POST or DELETE requests.
- [ ] Given a stale tab, when it POSTs a verdict, then the top bar shows the not-saved line and no retry follows.
- [ ] Given a pod deleted by hand, when the replacement is ready, then the concept-art tab loads the same images.
- [ ] Given the Mac host running, when an iPad opens the edit hostname and saves a verdict, then it saves.
- [ ] Given a forced commit mismatch, when the deploy runs, then it exits non-zero naming both commits.

**End-to-end verification:** ship a one-image change with `psrw ship --deploy`, confirm `verify-atlas-web.sh` passes with the new md5, then open the concept-art tab on phone (390x844) and desktop (1280x800) screenshots.

## UI states
| Screen | Ideal | Loading | Empty | Error | Recovery |
|---|---|---|---|---|---|
| App shell | Top bar shows the version | "Loading release…" in `#topbarStatus` | n/a | `/api/bundle` fails: "Can't load this release. A deploy may be in progress." with a Retry button | Retry, focus moves to the button |
| Any data panel | As today | Existing spinners | Existing `.empty-state` | As today | As today |
| Edit action | Control hidden | n/a | n/a | Stale tab: the not-saved line | Reload |
| Excluded tab | n/a | n/a | "Not in this release image. Open the edit site." | n/a | Link to `atlas-edit` |
| Version | "Read-only · 1.19 · abc1234" | "Loading release…" | n/a | `/api/runtime` fails: "Version unknown"; controls stay hidden unless the host is localhost | Reload |

## Interfaces & files
New: `Dockerfile.atlas-web`, `Dockerfile.atlas-web.dockerignore`, `k8s/local/atlas-world-web.yaml`, `scripts/verify-atlas-web.sh`, `scripts/tests/atlas-web-*.test.mjs`. Changed: `scripts/precheck.sh`, `scripts/catalog_explorer_web.py`, `scripts/atlas_world_web/` (routes, static mounts, frontend), `atelier/atlas-world-panels/js/view/VerdictSync.mjs`, `js/forge/work-orders.mjs`, `js/map-builder.mjs`, `k8s/local/ingress.yaml`, `scripts/deploy-local.sh`, `README.md`, `CLAUDE.md`.

## Alternatives considered
- Keep the host process and have ship restart it from `_release`: smallest change, but it stays a Mac process, is not a release artifact, and fails the owner's "in local k8s".
- Small nginx site with images and a static DB dump: lighter, but rebuilds every panel and loses `/api/sql`.
- Mount the checkout into the pod: fast, but the content follows a working tree, which is the bug.
- View-only on iPad, no edit hostname: simpler, but the owner loses verdicts on their main device.
- Do nothing: the stale-port failure returns.

## Assumptions
ASSUMED: the app takes over the existing hostnames; the host process stays for editing — reversible: Y
ASSUMED: the image includes all of `game-client/assets`; slice 1 measures it against a 500 MB target; if over, the excess is recorded and the owner is asked rather than trimming — reversible: Y
ASSUMED: local cluster only — reversible: Y
ASSUMED: `/api/sql` stays open and read-only, with no auth — reversible: Y
ASSUMED: one replica; the readiness probe covers the rollout gap — reversible: Y
ASSUMED: `psrw ship` keeps only warning when a deploy fails; `verify-atlas-web.sh` is the hard stop in the deploy itself, and changing ship is a separate ps-skills change — reversible: Y
ASSUMED: a deploy from a feature branch leaves this app on the last release — reversible: Y
ASSUMED: the page follows the last release deploy, not the last merge, so `ship --no-deploy` and `promote --direct` leave it behind with no on-page warning; the page states its commit and `verify-atlas-web.sh` reports the gap — reversible: Y

## Appendix — spec review
- 2026-11-01 spec-review: lenses tech, qa, product, ux. Findings 20 raw → 10 merged (10 dropped: bad citation 0, dup 10, low-conf 0).
  Applied: build from a git export; own ignore file and full contents; catalog failure check; full write-route coverage ahead of dispatch; hidden-control inventory; stale-tab handling; version placement and `/api/runtime` fields; strict thumbs and cache headers; `verify-atlas-web.sh`; Map Builder exclusion; readiness probe; new edit hostname. Answered from disk: 0. Asked at gate: 1 (edit hostname: approved). Assumed: 7.
