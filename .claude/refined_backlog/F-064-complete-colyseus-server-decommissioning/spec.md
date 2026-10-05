---
title: "Complete colyseus-server decommissioning, workspace cleanup, and Gate 1/2 gate update"
id: F-064
status: refined
from_idea: I-135
---

# Complete colyseus-server decommissioning, workspace cleanup, and Gate 1/2 gate update

## Acceptance criteria

- [ ] `colyseus-server/` is completely and permanently removed from the repository (`git rm -rf colyseus-server`).
- [ ] `pnpm-workspace.yaml` is updated to remove `colyseus-server`, leaving only active workspace packages (`contracts`, `client/react-client`, `nakama`, etc.).
- [ ] Content and asset key artifacts (`asset-keys.json`, `mob-types.json`, `spawn-areas.json`) are preserved in `content/generated/` (or `server-rs/generated/`), and scripts (`check_content.mjs`, `check_asset_manifest.mjs`, `season1.mjs`, `spawn-pairing.mjs`, `bestiary-sheet.mjs`) are updated to point to the new path.
- [ ] `scripts/precheck.sh` and `scripts/integration.sh` are updated to remove legacy TypeScript server checks (`server_typecheck`, `server_tests`, `server_coverage`, `server_e2e`, `server_format`), cementing `server-rs` as the sole authoritative game server.
- [ ] `scripts/deploy-local.sh` and Docker configurations are updated to build and run `server-rs` exclusively.
- [ ] Full Gate 1 precheck (`./scripts/precheck.sh --no-install`) and Gate 2 integration (`./scripts/integration.sh --no-install`) pass 100% cleanly on Rust with zero legacy TypeScript server code present.
