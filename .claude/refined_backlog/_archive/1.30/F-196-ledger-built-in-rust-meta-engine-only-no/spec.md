---
title: "Ledger: built-in Rust meta engine only (no Nakama), single server first, several later"
id: F-196
from_idea: I-281
status: refined
---

# I-281 Ledger: no Nakama, built-in meta engine

## Goal
Record the 2026-11-08 owner decision that player persistence uses only the built-in Rust meta engine (RustMetaEngine + SqliteMetaStore); Nakama is removed.

## Scope
Add rows to `content/studio/canon/decisions.json` (status `decided`):
- `meta-rust-only`: no Nakama; built-in engine only. Cleanup is split into: client MetaGateway moves to the Rust meta HTTP API; delete the server Nakama path and its tests; delete `nakama/`, k8s nakama/cockroachdb files, docker-compose entries and the Nakama CI gate; update docs.
- `meta-single-server-first`: one game server first; several servers sharing one player save comes later (needs a shared store behind the same store interface, still no Nakama).

## Out of scope
Any code deletion.

## Acceptance criteria
- [ ] Both rows exist, status `decided`, owner_answer filled.
- [ ] `node --test scripts/tests/catalog-canon.test.mjs` passes.
