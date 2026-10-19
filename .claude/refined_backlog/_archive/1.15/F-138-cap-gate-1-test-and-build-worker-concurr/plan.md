# Implementation Plan: F-138 — Cap Gate 1 Test and Build Worker Concurrency to Prevent OOM Freezes

1. Set `ATLAS_MAX_WORKERS="${ATLAS_MAX_WORKERS:-2}"`, `CARGO_BUILD_JOBS=2`, `RAYON_NUM_THREADS=2`, and `NODE_OPTIONS="--max-old-space-size=2048"` in `scripts/precheck.sh`.
2. Pass `--maxWorkers="$ATLAS_MAX_WORKERS"` to `npx jest` (`contracts`, `nakama`, `client/react-client`).
3. Pass `--jobs "$ATLAS_MAX_WORKERS"` and `--test-threads="$ATLAS_MAX_WORKERS"` to `cargo clippy` and `cargo test`.
4. Pass `--test-concurrency="$ATLAS_MAX_WORKERS"` to `node --test` (`art-forge`, `asset-storybook`, `map-builder`) and `--network-concurrency 2 --child-concurrency 2` to `pnpm install`.
5. Guard `--no-sandbox` in `atelier/asset-storybook/tests/smoke/run.mjs` with `process.platform === "linux"` so macOS Chrome does not wedge its DevTools pipe when `CI=true`.
