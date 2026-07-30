---
title: "Local k8s full-stack deploy: storybook + nakama + cockroachdb, wired into ship"
id: I-040
status: spec-approved
---

# Local k8s full-stack deploy: storybook + nakama + cockroachdb, wired into ship

## Problem

`scripts/deploy-local.sh` exists and is already invoked by the ship workflow
(`ship_current_work_to_release.py:147-182` — non-interactive/agent runs deploy by
default), but it covers only **one** of the four things a developer needs running
locally:

| Component | Today | Gap |
|---|---|---|
| colyseus-server | `k8s/local/colyseus-server.yaml`, deployed | — |
| asset-storybook | static `tools/asset-storybook/index.html`, opened by hand | **not deployed at all** |
| Nakama | `docker-compose.yml` only | **not on k8s** |
| CockroachDB | `docker-compose.yml` only | **not on k8s** |

After a ship, the local cluster therefore reflects only the game server. Reviewing
an asset/content change means opening a `file://` page by hand, and exercising a
meta change (auth, loadout, storage) means running a *second*, separate stack
under docker-compose that the k8s colyseus pod cannot reach.

Separately, `scripts/test_all.sh` exists but **nothing calls it**. Gate 1
(`precheck.sh`) covers contracts, server, nakama and combat-lab — but skips the
react-client suite that `test_all.sh` runs, so that suite gates nothing.

## Why now

The ship workflow already has the deploy hook wired; only the script behind it is
under-scoped. Extending that one script closes the gap without touching the
release tooling. Doing it now also retires the orphaned `test_all.sh` gap before
more features ship past an un-gated client suite.

## Goals

1. `./scripts/deploy-local.sh` brings up the **whole** local stack on k8s:
   colyseus-server, asset-storybook, Nakama, CockroachDB.
2. The storybook is reachable at a stable local URL, serving the real assets.
3. Gate 1 (`precheck.sh`) covers the react-client suite.
4. **No change to the ship workflow itself** — it already calls
   `deploy-local.sh`; extending that script is what wires the full stack in.

## Non-goals

- Any change to production / cloud manifests. `k8s/local/` stays local-only.
- Replacing `docker-compose.yml` — it remains a valid lighter-weight path.
- Agones allocation, multi-room scaling, or Grafana/Prometheus on local k8s.

---

## Decisions

Three design forks, decided by the user on 2026-07-31.

### D1 — Storybook is served from a baked, self-contained image

**Chosen:** an `nginx:alpine` image with the storybook and its assets copied in.
**Rejected:** hostPath mount of `$REPO_ROOT` (cheaper and live-reloading, but
local-only by construction); a plain `serve-storybook.sh` static server (simplest,
but then it is not part of the k8s deploy or the ship flow).

**Rationale:** self-contained and portable to any cluster; the pod carries exactly
the assets that were built, so what you review is what shipped.

**Known cost, accepted:** `game-client/assets` is **261 MB**. Mitigation is
mandatory layer ordering — assets are `COPY`d **first and alone**, ahead of the
small frequently-edited files, so a storybook or combat-lab edit reuses the cached
asset layer instead of re-copying a quarter gigabyte on every ship.

### D2 — Nakama + CockroachDB move onto local k8s

**Chosen:** full stack on k8s (CockroachDB StatefulSet + PVC; Nakama Deployment
with a migrate initContainer).
**Rejected:** leaving them on docker-compose.

**Rationale:** local topology matches prod; the colyseus pod and Nakama share one
cluster network instead of straddling two runtimes.

**Known cost, accepted:** slower deploys and a real chunk of new manifest surface
to maintain. Mitigated by the `--skip-*` opt-out flags below.

### D3 — Gate 1 absorbs the client suite

**Chosen:** fold the react-client suite into `precheck.sh` as one more section.
**Rejected:** having `precheck.sh` delegate to `test_all.sh` — that nests two
scripts with overlapping sections and duplicates the jest runs.

`test_all.sh` stays as the dev-facing convenience wrapper.

---

## Design

### The constraint that shapes everything

`tools/asset-storybook/index.html` loads assets via paths that **escape its own
directory**:

```
../../game-client/assets/{manifest,catalog-manifest,audio-manifest,music-manifest,render-spec}.json
../../game-client/assets/art/art-manifest.json
../../game-client/assets/{art,audio}/…
../../colyseus-server/generated/asset-keys.json
../combat-lab/index.html
```

Therefore the nginx **document root must be the repo root** with the original
directory layout preserved, and the page keeps its real path
(`/tools/asset-storybook/index.html`). `/` 302-redirects there.

### Build-context conflict

The root `.dockerignore` is a **whitelist** scoped to the colyseus build — it
excludes `game-client/` and `tools/` entirely. Loosening it would enlarge the
colyseus build context for no reason.

**Resolution:** give each new image a scoped `Dockerfile.dockerignore` sibling.
BuildKit prefers `<dockerfile-path>.dockerignore` over the root `.dockerignore`.
Docker 29.4 + buildx 0.33 are present so BuildKit is the default builder, but
`deploy-local.sh` sets `DOCKER_BUILDKIT=1` explicitly rather than relying on it —
a non-BuildKit build would silently fall back to the root whitelist and produce an
asset-less storybook image.

### New artifacts

| File | Purpose |
|---|---|
| `tools/asset-storybook/Dockerfile` | nginx image, repo-root layout, assets in their own cache layer |
| `tools/asset-storybook/Dockerfile.dockerignore` | scoped whitelist: assets, generated keys, storybook, combat-lab |
| `k8s/local/storybook-nginx.conf` | docroot, `/` redirect, `/healthz`, `no-store` on `*.json` |
| `k8s/local/storybook.yaml` | Deployment + Service (LoadBalancer :6006) |
| `nakama/Dockerfile` | 2-stage: esbuild the JS runtime → `heroiclabs/nakama:3.21.1` + module + `local.yml` |
| `nakama/Dockerfile.dockerignore` | scoped whitelist: workspace manifests, contracts, nakama |
| `k8s/local/cockroachdb.yaml` | headless Service + single-node StatefulSet + PVC |
| `k8s/local/nakama.yaml` | Deployment (migrate initContainer w/ retry) + Service (:7350/:7351) |

### Modified

- **`scripts/deploy-local.sh`** — build three images (`DOCKER_BUILDKIT=1`), apply
  manifests in dependency order (namespace → config → cockroachdb → nakama →
  colyseus → storybook), roll out and wait. Keeps the existing `verify_local_ctx`
  guard and re-checks it before **every** kubectl write. New opt-out flags:
  `--skip-storybook`, `--skip-meta` (nakama + cockroachdb), `--skip-server`.
  Default is the full stack.
- **`scripts/precheck.sh`** — add a `client: react-client suite` section
  (`CI=true npm test`), guarded so branches without `client/react-client` skip
  cleanly rather than fail (same pattern as the existing `combat_lab` section).

### Nakama runtime detail

`nakama/esbuild.config.mjs` bundles `src/main.ts` → `nakama/build/index.js` as a
flat, unwrapped script for goja. The image copies that to
`/nakama/data/modules/index.js` and `nakama/local.yml` to `/nakama/data/local.yml`,
matching the paths `docker-compose.yml` mounts. The migrate initContainer retries
in a loop because the StatefulSet may not be accepting SQL yet when it starts.

### Local endpoints after deploy

```
ws://localhost:2567/game    colyseus
http://localhost:2567/api   colyseus REST
http://localhost:6006/      asset storybook
http://localhost:7350       nakama HTTP API
http://localhost:7351       nakama console (admin/password)
```

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| 261 MB asset layer rebuilt every ship | medium | assets in their own leading `COPY` layer; `--skip-storybook` |
| Ship becomes slow (3 image builds) | medium | layer caching + the three `--skip-*` flags |
| Applying local manifests to a real cluster | high | existing `verify_local_ctx` guard, re-checked before every write; `image:local` + `imagePullPolicy: Never` |
| CockroachDB PVC accrues local disk | low | single 1 Gi PVC, namespace-scoped, deleted with the namespace |
| BuildKit not active → wrong `.dockerignore` | medium | `DOCKER_BUILDKIT=1` set explicitly by the script |

## Verification

- `./scripts/precheck.sh` passes, including the new client section.
- `./scripts/deploy-local.sh` on a local context: all four workloads reach Ready.
- `curl -f localhost:6006/healthz`; the storybook page loads and its manifest
  fetches return 200 (not 404) — proving the repo-root docroot is correct.
- `curl -f localhost:7350/healthcheck` returns 200 — proving migrate + boot.
- `curl -f localhost:2567/health` still returns 200 — no regression.
- A second `deploy-local.sh` run is materially faster — proving the asset layer cached.
