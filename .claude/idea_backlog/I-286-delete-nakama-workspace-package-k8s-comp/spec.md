---
title: "Delete nakama workspace package, k8s/compose manifests, and Nakama CI gates"
id: I-286
status: idea
---

# I-286 Delete nakama workspace package, k8s/compose manifests, and Nakama CI gates

## Goal
Delete the legacy `nakama/` TypeScript runtime workspace package, Kubernetes/Docker Compose Nakama + CockroachDB manifests, Nakama CI workflow, and Nakama sections in `precheck.sh` / `integration.sh` / `deploy-local.sh`, updating repo docs and comments.

## Scope
- Delete `nakama/` directory and `.github/workflows/nakama.yml`.
- Delete `k8s/local/nakama.yaml` and `k8s/local/cockroachdb.yaml`; remove `NAKAMA_*` env vars from `k8s/local/server-rs.yaml`.
- Remove `nakama` from `pnpm-workspace.yaml`, `docker-compose.yml`, `migrate.sh`, `scripts/deploy-local.sh`, `scripts/precheck.sh` (and update `scripts/tests/precheck-groups.test.mjs` / `precheck-*.test.mjs` if they assert on `nakama` group entries), `scripts/integration.sh`, `scripts/test_all.sh`, `scripts/e2e-meta.sh`.
- Update `CLAUDE.md`, `README.md`, and `contracts/src/meta/{catalogs,schemas,types}.ts` comments to reflect built-in `RustMetaEngine` persistence (`server-rs/src/meta`).

## Acceptance criteria
- [ ] `nakama/`, `.github/workflows/nakama.yml`, `k8s/local/nakama.yaml`, and `k8s/local/cockroachdb.yaml` are deleted.
- [ ] `pnpm-workspace.yaml`, `docker-compose.yml`, `k8s/local/server-rs.yaml`, and `scripts/precheck.sh` have no `nakama` service/package references.
- [ ] `node --test scripts/tests/precheck-*.test.mjs` passes.
