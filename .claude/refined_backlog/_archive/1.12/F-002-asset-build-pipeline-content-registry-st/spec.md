---
title: "Asset build pipeline: content registry + storybook + CC0 seed set"
id: F-002
from_idea: I-003
status: refined
reconciled_at: "2026-07-20"
reconciled_by: "F-006 (registry-binding spine, Phase 1)"
---

# Asset build pipeline: content registry + storybook + CC0 seed set — design (delivered)

> **Reconciliation note (2026-07-20).** This row was the lone `status: open`
> feature in the refined backlog, but **all of its work was in fact delivered**
> and shipped to `main` under the **release 1.2** umbrella (squash-merge
> `3cf96e7`, 2026-07-19), alongside F-003/F-004/F-005. F-002 predates the point
> where the asset-pipeline work was formally routed through
> claim → ship → promote, so its own catalog row was never advanced — a
> bookkeeping artifact, not missing work. The provenance table below maps every
> planned task to the deliverable that exists in the tree today and the commit
> that landed it. The `_catalog.json` status is intentionally **left untouched**
> here: there is no sanctioned toolkit path to retro-promote a feature whose
> work shipped under another feature's release, and hand-editing the catalog is
> forbidden (R1, release-manager owned). The retro-promote-vs-formal-close
> decision is deferred to the release manager (see *Open decision* below).

## Goal

Stand up the client asset-content pipeline spine: server-type-id → asset
content registry with graceful three-tier fallback (bespoke → CC0 seed →
procedural capsule), a codegen-emitted key set as the single source of truth, a
CI drift-gate, and a CC0 seed set — so the game renders real low-poly content
instead of capsules and the registry is never empty.

## Architecture

The contracts codegen (`colyseus-server/scripts/codegen/gen-asset-keys.ts`)
emits `generated/asset-keys.json` — the authoritative set of renderable/audible
server type ids. Committed JSON manifests (`game-client/assets/manifest.json` +
curated `audio`/`music`/`catalog` manifests) map each key → `{ scene|stream,
source, license, tier }` against the declarative `render-spec.json` renderer
contract. A Godot `AssetRegistry` autoload resolves `type id → PackedScene`
best-available across three tiers. `scripts/check_asset_manifest.mjs` gates that
every emitted key has a manifest entry whose `res://` file exists and carries
license + source; the render-spec is the SAME file the gate, the storybook, and
the C# `AssetRegistry.Resolve` all read, so the three consumers cannot disagree.

## Provenance table (task → deliverable → delivering commit / release)

| Task | Planned deliverable | Exists in tree (verified 2026-07-20) | Landed via |
|------|--------------------|--------------------------------------|-----------|
| 1 — Codegen emits key set (D3) | `gen-asset-keys.ts`, `generated/asset-keys.json` (19 keys) | ✅ | `release 1.2 (#4)` `3cf96e7` |
| 2 — Manifest schema + loader | `game-client/assets/manifest.json`, `AssetManifest.cs` | ✅ | `release 1.2 (#4)` `3cf96e7` |
| 3 — AssetRegistry three-tier resolve | `game-client/src/Content/AssetRegistry.cs` | ✅ | `release 1.2 (#4)` `3cf96e7` |
| 4 — Wire registry into entity rendering | `game-client/src/World/EntityView.cs` — a **modify** task: the file itself predates 1.2 (added in release 1.1 `a783a5f`); the registry wiring (`AssetRegistry.Instance.Resolve(...)`, +114/−21) landed via feature commit `93a86d9` "entities render via AssetRegistry" | ✅ | `release 1.2 (#4)` `3cf96e7` |
| 5 — CI drift-gate | `scripts/check_asset_manifest.mjs` | ✅ | `release 1.2 (#4)` `3cf96e7` |
| 6 — `art-source/` LFS + intake/delivery docs | `art-source/`, `docs/asset-intake.md`, `docs/asset-delivery-spec.md` | ✅ | `release 1.2 (#4)` `3cf96e7` |
| 7 — CC0 seed ingest (Stage 0.5) | seed-tier assets (Quaternius/Kenney/KayKit); e.g. `22e59b8`, `fd18a84`, `081b2f4` + F-A sourcing sweep | ✅ | `release 1.2 (#4)` `3cf96e7` |

> Because release 1.2 was **squash-merged** to `main`, the individual F-002 task
> commits collapse into `3cf96e7`; the per-task feature commits (e.g. `93a86d9`)
> remain visible on their now-merged feature branches for audit.

## Components

- `gen-asset-keys.ts` — enumerate renderable/audible server type ids from real
  config (never hand-listed); emit `asset-keys.json` deterministically.
- `manifest.json` + curated `audio`/`music`/`catalog` manifests — key → asset.
- `render-spec.json` — declarative renderer contract shared by every consumer.
- `AssetManifest.cs` / `AssetRegistry.cs` — parse + three-tier `Resolve`.
- `EntityView.cs` — consume the registry (capsule fallback preserved).
- `check_asset_manifest.mjs` — CI drift-gate (keys ↔ render-spec ↔ manifest ↔
  files ↔ license).

## Data flow / state

server type id (synced schema) → codegen key → manifest entry → render-spec
renderer → `res://` asset → Godot `PackedScene` → `EntityView`. Missing/unknown
key never throws → procedural capsule + warning.

## Tests / acceptance criteria (met)

- `node scripts/check_asset_manifest.mjs` → exit 0 (verified 2026-07-20).
- Codegen `asset-keys.json` regenerates deterministically; drift is meaningful.
- Every emitted key resolves through the registry or falls back gracefully.

## Open decision (deferred to release manager)

Reconcile the `_catalog.json` `status` for F-002. Options:
1. **Leave `open`, rely on this reconciliation doc** (current state) — zero
   catalog surgery; the doc is the source of truth for "delivered under 1.2".
2. **Formally retro-promote / close** via a sanctioned toolkit change routed
   through the `_release` worktree, if/when such a path is added.

This spine feature (F-006) does not perform option 2, to avoid an off-process
catalog edit. The follow-up is tracked as part of F-006's Phase 1.
