# F-174 Godot client loads pipeline characters (combat states, runtime weapon swap): Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use subagent-driven-development (fresh subagent per task + review gate). Each task's tests come first; a builder starts only after the failing test is shown red for the stated reason.

**Goal (owner, verbatim):** "fewer future issues; 3D model + animation generation with almost zero human need; multi-component characters (body + weapons); more assets, high quality, faster, lower cost." F-174 = Phase 6: the Godot client loads the pipeline sergeant, plays combat states, and swaps the weapon at runtime.

**Architecture:** The repo is public, so the sergeant is **pulled, never committed** (owner decision 2026-11-06, R0). Its manifest entry records the Asset Studio asset id, tag and sha256 under the licence `studio-private`. `scripts/studio-pull.mjs` fetches the bytes into the gitignored `game-client/studio-cache/<sha256>.glb` and refuses any download whose sha256 differs from the one in the Asset Studio record. One non-interactive intake (`atelier/asset-forge/intake.mjs`), driven from a batch report row, validates the pulled glb under a new kind `pipelineCharacter` and writes that pull-only entry. In the client, `AnimationController` gains a combat path that only switches on for manifest entries that map `combat_idle` (current content is untouched), and a new `WeaponSocket` replaces the baked weapon under the hand `BoneAttachment3D`. A new env-gated probe (`PipelineCharVerify`, run on the pinned mono Godot) and a manifest clip gate run in a path-gated Gate 1 section. A windowed render strip and a Game Systems page in the lore panel make the result visible.

**Tech Stack:** Node 22 (`node --test`, `@gltf-transform/core`), Godot 4.7.2 mono + C# / .NET 8, bash (`scripts/precheck.sh`), vanilla ES modules (atlas-world panels).

**Spec:** `.claude/refined_backlog/F-174-godot-client-loads-pipeline-characters-c/spec.md` (owner-approved, rev 2).

## Global Constraints

- **Budget (provisional, D3):** `pipelineCharacter` height **0.95-1.15 u**, triangles **<= 15,000**, bytes **<= 2.8 MB** (`maxBytes: 2936012` = 2.8 MiB, the unit `ls -h` used for "warden is 2.8 MB"). Sergeant measured: 1.050 u, 14,448 tris, 2,645,916 bytes.
- **Blend:** **0.15 s** into attack **only for entries that map `combat_idle`**; every other entry keeps **0.05 s** (existing mobs). Loops keep 0.15 s.
- **Probe marker:** the probe prints **`[PipelineCharVerify] VERDICT PASS`** and exits 0, or prints FAIL lines and exits 1. Gates require the marker line, never an exit code alone.
- **Godot binary:** always the pinned mono build via **`ATLAS_GODOT_MONO`** (default `$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot`). PATH `godot` is non-mono (`4.7.2.stable.official`) and exits 0 on C# failure; `scripts/godot-verify.sh` refuses a version string without `mono`.
- **Server-authoritative:** client only. InCombat comes from `target_id`, hit from `GameEvent.Hit`, the player's attack stays local input. Block and remote attack have no wire signal (filed as **I-255**, commit `37df4df4a`); slice 1 drives them through the controller API only. No `schemas/` or `server-rs/` edits.
- **Pull, don't commit (owner R0, 2026-11-06):** the repo is PUBLIC. The sergeant glb, its Godot `.import`, any extracted texture and every render of it stay out of git. The source of truth is Asset Studio asset **`01a1a97a-8e45-71d6-885f-459aa1cebf7f`**, tag **`p4b-11050912`**, sha256 **`7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f`** (the API record, verified 2026-11-06). It is *not* the pack's local `out.glb` (`0ac13d97…`), whose binary buffer differs in 1,742 bytes. The cache is `game-client/studio-cache/` (gitignored), and the licence is `studio-private`, never CC0. Never import or run any `characters/*/tripo/*.py`.
- **Studio token:** env `STUDIO_TOKEN`, else the same route as `atlas_char/batch.py` `token()` (orbstack secret → `asset-studio/scripts/dev-token.mjs`). Never print it.
- **Asset Studio unreachable (rev 3, orchestrator decision, binding):** Asset Studio runs on this machine, so **local Gate 1 never accepts a studio SKIP**. A cold cache with Asset Studio unreachable FAILS. If `ATLAS_SKIP_STUDIO=1` is set while `precheck.sh` runs, the pipeline-char section FAILS with `studio skip not allowed in Gate 1`. Only `ci.yml` sets `ATLAS_SKIP_STUDIO=1` (CI can never reach the studio), and that step prints a visible `::warning::` line saying the pull-only checks were skipped. A token the studio refuses (401/403) is always a FAIL `studio auth failed`, never "unreachable".
- **Every Godot call is bounded:** `scripts/godot-verify.sh` wraps each one in `timeout` (`/usr/local/bin/timeout` and `gtimeout` are both present; perl `alarm` is the fallback). Probe runs use `ATLAS_GODOT_TIMEOUT`, default 180 s. The `--import` run has its own bound, `ATLAS_GODOT_IMPORT_TIMEOUT`, default 900 s, because a fresh worktree imports ~633 glbs. The PASS marker is still required.
- **Every network/cluster call is bounded:** Asset Studio `fetch` calls carry `AbortSignal.timeout(30000)`; every `kubectl` (and the dev-token `node`) call in the token route runs with `timeout: 20000`.
- `--headless` has no pixels; the render strip uses a windowed run with `--write-movie`.
- Non-goals (spec §Non-goals) stay out: upper-body layer, off-hand IK, shield swap, ranger/warden intake, server flags, NPC identity mapping, Godot CI job. **Back in scope (owner goal fidelity, rev 2):** intake takes a batch report row (asset id + tag) plus the default pipeline clip map, so a new character needs zero hand-written JSON. It is a single command, not an automatic batch loop. Each intake prints its wall time and the Tripo credits of the batch it came from (`credits_spent` / `credits_est`), the "faster" and "lower cost" numbers of the goal.
- **Next feature, not this one (rev 3):** batch-loop intake of the ranger and the warden (one command intakes every PASS row of a batch report). The idea text is filed in `handoff.md` §"Next feature idea"; F-174 proves the single-row path it will loop over.

## Facts checked on disk while planning (2026-11-06)

These correct or sharpen the spec. Tasks below already account for them.

1. **`target_id` already drives "attacking".** `game-client/src/World/EntityManager.cs:154` sets `isAttacking = d.TargetId != 0`, and `EntityView.UpdateAnimation` (`EntityView.cs:375`) passes it to `AnimationController.Update`. Reinterpreting `target_id` as InCombat for every entity would stop every mob's attack clip. Task 7 reinterprets it **only for combat-mapped entries**.
2. **The main scene is `res://scenes/VerticalSlice.tscn`** (`project.godot:14`), whose root `VerticalSliceRoot.cs:138-164` carries the probe hooks that actually run (VERTICAL_SLICE, ENTITYVIEW, ANIM, FACING). `GameRoot` belongs to `Main.tscn`, which the default run never loads, so its `ATLAS_VERIFY_MANIFEST` hook (`GameRoot.cs:37`) can never fire through `godot-verify.sh`. The run would boot the slice and wait for a server. **The new hooks go in VerticalSliceRoot only**, and no task calls the MANIFEST probe.
3. **Sergeant skeleton = 68 joints:** 65 `mixamorig:*`, plus `prop_weapon_r` (parent `mixamorig:RightHand`), `prop_shield_l` (parent `mixamorig:LeftHand`), and `handslot.r` (parent `prop_weapon_r`). `handslot.r` fails the S2 bone grammar in `validate.mjs:177-232`, so the rig reference needs an explicit `fixedExtras` allowance.
4. **The rig reference must be per kind.** If `mixamo-65` only joins the global `rigReference` list, `pipelineCharacter` would still accept KayKit rigs (which match the global list), and the "red on a KayKit mob glb" criterion could not pass. Task 1 adds `kinds.pipelineCharacter.rigReference`.
5. **Intake validates the source basename.** `validate.mjs:471-481` checks the naming rule and the license ledger against `out.glb`, and the ledger check is a substring test (`"out"` matches almost any ledger). Intake gains `--dest-name`, and it validates a staged copy under that name.
6. **The manifest gate needs more than a new entry:** guard (T) wants the kind in `content/asset-taxonomy.json`. Guard (U) wants a baked thumbnail recorded in the tracked `game-client/assets/.thumbs/index.json`, but a tracked thumbnail of the sergeant would publish its image, so (U) skips pull entries. The licence policy (`scripts/lib/license-policy.mjs:10`) allows only `CC0`/`CC-BY-*`. Task 2 adds `studio-private`, valid **only** on a pull-only entry. Guard (B) fails a missing file, so Task 2 gives pull entries their own cache rule.
7. **Glbs are Git LFS** (`.gitattributes:7`), but that no longer matters for the sergeant: no byte of it is committed. CI cannot reach the local Asset Studio, so `ci.yml:70` gets `ATLAS_SKIP_STUDIO=1` plus a visible `::warning::` line. Local Gate 1 refuses that variable.
8. **All 8 existing manifest `anims` blocks name clips that exist** in their glbs (scratch scan), so the new clip gate starts green.
9. **Cost is lower than the spec guessed:** an incremental `dotnet build` took 4 s and the `ATLAS_VERIFY_ANIM=1` mono boot took about 1 s (it printed `RESULT: PASS (all cases)` today).
10. **`lore.mjs` is the World Bible** (chapters premise…mysteries from `content/studio/*.json`); it has no game-systems section. Task 10 adds a "Game Systems" chapter, sourced from a new `content/studio/game-systems.json` (`content/studio` is already a static mount).
11. **`scripts/tests/*` are not run by Gate 1** (only CI, which atlas skips under direct promote). The new section runs the new script tests itself.
12. **Clip mapping choice:** `combat_idle → block_idle` (guard stance loop) and `block → block`. The strip shows it so the owner can change it.
13. **Asset Studio API (read 2026-11-06):** `GET /v1/library/assets/{id}?clientId=atlas-world` with a bearer token returns `{asset: {sha256, size, tags, rights, mediaUrl, …}}` (`asset-studio/go/internal/api/server.go:227`, `go/internal/library/repo.go` `PresentAsset`). `mediaUrl` is a signed `/v1/library/assets/{id}/media?exp=…&sig=…` (`server.go:232`), and it returned the bytes with or without the bearer. The sergeant record: sha256 `7f1c54c3…c75f`, size 2,645,916, `rights: "reference"`, tags include `tripo`, `mixamo`, `p4b-11050912`.
14. **The approved bytes differ from the local pack output.** `out.glb` hashes to `0ac13d97…`, and the Asset Studio media hashes to `7f1c54c3…`. They have the same size and an identical JSON chunk (the same 12 clips), and 1,742 bytes of the binary buffer differ. Rev 1 would have pinned the wrong sha.
15. **Batch report rows** (`~/asset-studio-private/atlas-3d-plan/batches/<name>/report.json` → `characters[]`) carry `slug, status, gates, seconds, asset, tag, link, link_check`, and no sha256. The sergeant row is in `p5-existing` and `p5-acceptance`: `status PASS`, `asset 01a1a97a…`, `tag p4b-11050912`, `seconds 209.4`. So the sha always comes from the API record.
16. **No dot-directory for the cache:** Godot's import scanner skips dot-directories, and `scripts/atlas_world_web/static_mounts.py:44-45` serves exactly one dot path (`game-client/assets/.thumbs`). Hence `game-client/studio-cache/`. A gitignored mount already has precedent: `atelier/art-forge/out` is in `ABSENT_MOUNTS` (`scripts/check_atlas_web_image.py:18`).
17. **NPC scale:** `EntityView.ResolveChibiScaleFactor` returns **0.68** for every `EntityKind.Npc` (`EntityView.cs:208`), a factor tuned for 1.6-2.0 u bodies. On the 1.05 u sergeant that would render a 0.71 m guard, so Task 7 scales `pipelineCharacter` entries at 1.0.
18. **Hit wiring is partial:** `VerticalSliceRoot.cs:1552` handles `GameEvent.Hit` only where `ev.SourceId == myWireId`, meaning hits the local player deals. So the hit clip plays only on entities the local player strikes.
19. **Timeout binaries:** `/usr/local/bin/timeout` and `/usr/local/bin/gtimeout` exist; `/usr/bin/perl` is the fallback.
20. **(rev 3) The thumbnail baker would leak the sergeant.** `scripts/bake_thumbnails.mjs` `collectJobs` (lines 109-128) queues every manifest `scene` with no pull filter and writes into the tracked `game-client/assets/.thumbs/`, which ships in the release image (`Dockerfile.atlas-web.dockerignore:9` `!game-client/assets/**`). Task 2 skips pull entries there and guard (W) fails on any `res://studio-cache/` row in `.thumbs/index.json`.
21. **(rev 3) `atelier/asset-forge/.gitignore:2` ignores `fixtures/`**, so a fixture under `atelier/asset-forge/tests/fixtures/` would never be committed. The report fixture lives at `atelier/asset-forge/tests/studio-report.fixture.json`, and a test asserts `git check-ignore` exits non-zero for every new fixture.
22. **(rev 3) `game-client/export_presets.cfg:11` is `exclude_filter=""`** (the key Godot reads for export exclusions). Task 1a sets it to `studio-cache/*`, so a future `.pck` export never bundles private bytes.
23. **(rev 3) Batch reports carry credits at the top level only:** `{name, credit_cap, credits_est, credits_spent, characters[]}` (`atlas_char/batch.py:147`). `p5-existing` shows `credits_est 0`, `credits_spent 0` (it re-used existing assets). Intake prints them as the batch total.

## File structure

| Path | Change | Responsibility |
|---|---|---|
| `atelier/asset-forge/forge.config.json` | Modify | `pipelineCharacter` kind (budgets, optionalStates, per-kind rigReference) |
| `atelier/asset-forge/rig-reference/mixamo-65.bones.json` | Create | 65-joint Mixamo core + prop/handslot allowances |
| `atelier/asset-forge/validate.mjs` | Modify | per-kind rig ref, `maxBytes`, list/optional anims, `fixedExtras`, `stateKeysForKind` export |
| `atelier/asset-forge/intake.mjs` | Modify | widened anims, `--dest-name`, studio mode (`--from-report/--slug`, `--studio-asset/--tag`), pull-only entry, wall-time line |
| `.gitignore` | Modify | `game-client/studio-cache/` (glb, `.import`, textures, renders) |
| `game-client/export_presets.cfg` | Modify | `exclude_filter="studio-cache/*"`: no export ever bundles private bytes |
| `scripts/bake_thumbnails.mjs`, `scripts/tests/bake-thumbnails-pull.test.mjs` | Modify / Create | never queue a pull-only entry (its thumbnail would ship in the tracked `.thumbs/`); export `collectJobs` for the test |
| `scripts/lib/studio-token.mjs`, `scripts/lib/studio-pull.mjs`, `scripts/studio-pull.mjs`, `scripts/tests/studio-pull.test.mjs`, `scripts/tests/fixtures/studio/*.json` | Create | token (batch.py route), sha256-verified fetch into the cache, offline tests |
| `scripts/lib/pull-entry.mjs`, `scripts/tests/pull-entry.test.mjs` | Create | pull-only entry rules: cache sha, loud fail / explicit SKIP (CI only), nothing tracked and no tracked thumbnail or Godot file derived from the cache (W) |
| `atelier/asset-forge/tests/studio-report.fixture.json` | Create | batch report fixture (not under the gitignored `fixtures/`) |
| `scripts/lib/license-policy.mjs` | Modify | `studio-private` allowed only on pull-only entries |
| `.github/workflows/ci.yml` | Modify | `ATLAS_SKIP_STUDIO=1` on the manifest-gate step, plus a visible `::warning::` line |
| `scripts/system-deps.json` | Modify | `kubectl`, `dotnet`, `godot-mono` (all `required: false`, each with a note) |
| `scripts/atlas_world_web/static_mounts.py`, `scripts/check_atlas_web_image.py` | Modify | serve `game-client/studio-cache/renders` when present (absent in the image) |
| `atelier/asset-forge/tests/{validate,intake}.test.mjs` | Modify | new cases |
| `atelier/asset-forge/README.md` | Modify | pipelineCharacter + approval intake |
| `content/asset-taxonomy.json`, `game-client/assets/render-spec.json` | Modify | register `pipelineCharacter` (guards T, J/render) |
| `art-source/LICENSES.md` | Modify | `studio-private` ledger row for `lantern_hollow_watch_sergeant` (pull-only) |
| `game-client/studio-cache/7f1c….glb` (+ `.import`) | Pulled, **gitignored, never committed** | the sergeant |
| `game-client/assets/manifest.json` | Modify (via intake) | pull-only entry (no thumbnail) |
| `scripts/lib/anim-clips.mjs`, `scripts/tests/anim-clips.test.mjs` | Create | clip-exists + combat-completeness rule |
| `scripts/check_asset_manifest.mjs` | Modify | call the rule from `validateEntry` |
| `game-client/src/Content/AssetManifest.cs`, `AssetRegistry.cs` | Modify | `AnimVariants` (string or list) |
| `game-client/src/World/AnimationController.cs` | Modify | combat state machine |
| `game-client/src/World/WeaponSocket.cs` | Create | Equip / Unequip |
| `game-client/src/World/PipelineCharVerify.cs` | Create | env-gated probe |
| `game-client/src/World/PipelineStripRender.cs` | Create | windowed render strip |
| `game-client/src/World/EntityView.cs`, `game-client/src/VerticalSliceRoot.cs`, `game-client/src/Content/AssetRegistry.cs` | Modify | wire InCombat/Hit, true scale for `pipelineCharacter`; probe + strip hooks (VerticalSliceRoot only) |
| `scripts/godot-verify.sh`, `scripts/tests/godot-verify.test.mjs` | Create | pinned-mono probe runner that demands the PASS line |
| `scripts/precheck.sh`, `scripts/tests/precheck-pipeline-char.test.mjs` | Modify / Create | path-gated section |
| `game-client/studio-cache/renders/7f1c….strip.png` | Rendered, **gitignored** | render strip (served by the edit host from disk) |
| `content/studio/game-systems.json` | Create | wiki page SSOT |
| `atelier/atlas-world-panels/js/lore-model.mjs`, `js/panels/lore.mjs`, `css/panels.css`, `tests/lore.test.mjs`, `README.md` | Modify | Game Systems chapter |
| `README.md` (repo) | Modify | Godot verify probes + strip command |

There is no `game-client/README.md`. Godot notes go in the repo `README.md` §"3. Build & Run Godot".

Shared shell variables used in commands below:

```bash
WT=/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-174-godot-client-loads-pipeline-characters-c
SERGEANT_ASSET=01a1a97a-8e45-71d6-885f-459aa1cebf7f
SERGEANT_SHA=7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f
SRC_GLB=$WT/game-client/studio-cache/$SERGEANT_SHA.glb   # filled by Task 1a (node scripts/studio-pull.mjs); never committed
GODOT="${ATLAS_GODOT_MONO:-$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot}"
```

Waves (one consolidated review per wave, rule 7): **A** = Tasks 1a, 1-3 (node, R1: gate + intake contract), **B** = Tasks 4-7 (C#, R1: runtime animation path), **C** = Tasks 8-9 (Gate 1 + strip, R1: CI-like config), **D** = Tasks 0, 10, 11 (UI + live). R1 waves get `code-reviewer` + the language reviewer (`typescript-reviewer` for .mjs; `code-reviewer` covers C#), one fix round, one scoped re-review.

---

## Task 0: Design brief for the Game Systems chapter (controller, before Task 10)

**Files:** Create `.claude/refined_backlog/F-174-godot-client-loads-pipeline-characters-c/design-brief.md`.

The controller (not a subagent) runs `impeccable` (shape) on the lore panel as it stands (`?tab=lore` on `:8788`) and writes `design-brief.md` with these sections: audience (a player reading how combat stances work), placement (a new last chapter "Game Systems", icon 🛡️), content blocks (title, one-line summary, 3-4 short sections, the strip image with a per-frame caption row, "known limits" callout), reuse of the existing `lore-*` classes and the panel tokens in `css/panels.css` (`--border`, `--text-dim`, `--accent`; no new colours), phone behaviour (the strip scrolls horizontally inside its own frame, `overflow-x: auto`, so the page never scrolls sideways), empty/error state (the chapter shows "Game systems archive unavailable" and the rest of the World Bible still renders), and accessibility (`alt` text on the strip, captions as real text).

Gate: the brief exists before Task 10 starts; Task 10's critique is checked against it.

---

## Task 1a: Pull the approved glb into a gitignored cache (runs before Task 1)

Owner decision 2026-11-06 (R0, binding): the repo is public, so the Tripo + Mixamo sergeant is never committed and never recorded as CC0. The bytes stay in Asset Studio. This task builds the fetch: a manifest entry records asset id, tag and sha256, and the client, the probes and the strip read a cache copy that is trusted only after it hashes to that sha256.

**Files:**
- Create: `scripts/lib/studio-token.mjs`, `scripts/lib/studio-pull.mjs`, `scripts/studio-pull.mjs`, `scripts/tests/studio-pull.test.mjs`
- Create (fixtures): `scripts/tests/fixtures/studio/sergeant-asset-record.json`, `scripts/tests/fixtures/studio/pull-manifest.json`
- Modify: `.gitignore` (one block), `game-client/export_presets.cfg` (line 11 `exclude_filter`), `scripts/system-deps.json` (`kubectl`, `required: false`)

**Why `game-client/studio-cache/` and not `game-client/.cache/studio/`:** Godot's import scanner skips dot-directories, so it would never import a glb there. `scripts/atlas_world_web/static_mounts.py:44-45` also serves exactly one dot-directory (`game-client/assets/.thumbs`), so a render under a dot path could not reach a review surface either. The root `.gitignore` already ignores `.cache` (lines 81 and 91). The new directory gets its own explicit entry.

**Interfaces:**
- `studioToken({env = process.env, run = spawnSync} = {}) → string | null`. Every `run` call passes `timeout: 20000` (20 s), so a wedged cluster can never hang Gate 1. It reads `STUDIO_TOKEN` first. Otherwise it uses the same route as `~/asset-studio-private/atlas-3d-plan/atlas_char/batch.py` `token()` (lines 17-30): `kubectl --context orbstack -n asset-studio` secret `asset-studio-secret` → `JWT_SECRET_KEY`, configmap `asset-studio-config` → first `OWNER_EMAILS` entry, then `node ~/workspace/repos/asset-studio/scripts/dev-token.mjs` with those two values in env. It never logs the token and returns null on any failure.
- `studioUrl(env) → string`: `ATLAS_STUDIO_URL`, default `http://asset-studio.joymify.local.com`. `STUDIO_CLIENT = "atlas-world"`.
- `fetchAssetRecord(assetId, {token, fetchImpl, baseUrl}) → Promise<{id, sha256, size, tags, rights, mediaUrl, …}>` calls `GET /v1/library/assets/{id}?clientId=atlas-world` with a bearer token (`asset-studio/go/internal/api/server.go:227`) and `signal: AbortSignal.timeout(30000)`. The response is `{asset: …}`, built by `PresentAsset` in `go/internal/library/repo.go`. A 401/403 throws `studio auth failed (http <n>) …` with `err.auth = true`.
- `isCached(cacheDir, sha256) → boolean` re-hashes the cache file. It never trusts a filename alone.
- `pullAsset({assetId, sha256, cacheDir, token, fetchImpl = fetch, baseUrl, record = null}) → Promise<{ok: true, path, cached} | {ok: false, failure, unreachable?: true}>`. It writes `<cacheDir>/<sha256>.glb` only after the downloaded bytes hash to `sha256`, and a mismatch writes nothing. The media fetch also carries `AbortSignal.timeout(30000)`. Network errors, timeouts and 5xx are `unreachable`; 401/403 is a hard `studio auth failed`; any other 4xx is a hard failure.
- `pullEntries(manifest) → Array<{id, assetId, tag, sha256}>` lists the entries that have a `pull` block.
- CLI `node scripts/studio-pull.mjs [--manifest <path>] [--cache-dir <dir>]`. The cache dir defaults to `game-client/studio-cache`, overridden by env `ATLAS_STUDIO_CACHE_DIR`. Exit codes: **0** every entry is cached or pulled; **1** sha mismatch, a bad record or `studio auth failed`; **2** Asset Studio unreachable or no token. Exit 2 prints a line saying local Gate 1 never skips and only CI sets `ATLAS_SKIP_STUDIO=1`.

**Step 1: failing tests**

```json test:scripts/tests/fixtures/studio/sergeant-asset-record.json
{
  "_note": "Copied from GET /v1/library/assets/01a1a97a-8e45-71d6-885f-459aa1cebf7f?clientId=atlas-world on 2026-11-06. The signed query string of mediaUrl is dropped. Metadata only: the bytes are never in this repo.",
  "asset": {
    "id": "01a1a97a-8e45-71d6-885f-459aa1cebf7f",
    "name": "Lantern Hollow Watch Sergeant p4b-11050912",
    "mime": "model/gltf-binary",
    "size": 2645916,
    "sha256": "7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f",
    "rights": "reference",
    "tags": ["atlas", "slice", "tripo", "mixamo", "town-guards", "round-6", "p4b-11050912"],
    "mediaUrl": "/v1/library/assets/01a1a97a-8e45-71d6-885f-459aa1cebf7f/media"
  }
}
```

```json test:scripts/tests/fixtures/studio/pull-manifest.json
{
  "version": 2,
  "entries": {
    "npc:lantern_hollow_watch_sergeant": {
      "scene": "res://studio-cache/7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f.glb",
      "pull": {
        "from": "asset-studio",
        "assetStudioAsset": "01a1a97a-8e45-71d6-885f-459aa1cebf7f",
        "tag": "p4b-11050912",
        "sha256": "7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f"
      }
    }
  }
}
```

```js test:scripts/tests/studio-pull.test.mjs
// F-174 pull-by-manifest. Offline: every network call goes through a fetch double.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { pullAsset, pullEntries } from "../lib/studio-pull.mjs";
import { studioToken } from "../lib/studio-token.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIX = join(ROOT, "scripts/tests/fixtures/studio");
const RECORD = JSON.parse(readFileSync(join(FIX, "sergeant-asset-record.json"), "utf8")).asset;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const BYTES = Buffer.from("glTF fixture bytes, not the sergeant");
const tmp = () => mkdtempSync(join(tmpdir(), "studio-pull-"));

// The record route returns `record`; the media route returns `body`.
function fakeFetch({ record = RECORD, body = BYTES, calls = [] } = {}) {
  return async (url, init) => {
    calls.push({ url: String(url), auth: init?.headers?.authorization ?? null });
    if (String(url).endsWith("/media")) return new Response(body, { status: 200 });
    return new Response(JSON.stringify({ asset: record }), { status: 200 });
  };
}

test("sha mismatch: bytes that do not hash to the recorded sha256 are refused and nothing is cached", async () => {
  const cacheDir = tmp();
  const r = await pullAsset({ assetId: RECORD.id, sha256: RECORD.sha256, cacheDir, token: "t", fetchImpl: fakeFetch() });
  assert.equal(r.ok, false);
  assert.match(r.failure, new RegExp(`sha256: ${sha(BYTES)} != recorded ${RECORD.sha256}`));
  assert.deepEqual(readdirSync(cacheDir), []);
});

test("sha match: bytes land at <cacheDir>/<sha>.glb; a second call is served from cache with no request", async () => {
  const cacheDir = tmp();
  const want = sha(BYTES);
  const calls = [];
  const f = fakeFetch({ record: { ...RECORD, sha256: want }, calls });
  const a = await pullAsset({ assetId: "a", sha256: want, cacheDir, token: "t", fetchImpl: f });
  assert.deepEqual(a, { ok: true, path: join(cacheDir, `${want}.glb`), cached: false });
  assert.equal(sha(readFileSync(a.path)), want);
  assert.ok(calls.every((c) => c.auth === "Bearer t"));
  const n = calls.length;
  const b = await pullAsset({ assetId: "a", sha256: want, cacheDir, token: null, fetchImpl: f });
  assert.equal(b.cached, true);
  assert.equal(calls.length, n);
});

test("a corrupted cache file is re-downloaded, not trusted by its name", async () => {
  const cacheDir = tmp();
  const want = sha(BYTES);
  writeFileSync(join(cacheDir, `${want}.glb`), "corrupt");
  const r = await pullAsset({ assetId: "a", sha256: want, cacheDir, token: "t", fetchImpl: fakeFetch({ record: { ...RECORD, sha256: want } }) });
  assert.equal(r.ok, true);
  assert.equal(r.cached, false);
  assert.equal(sha(readFileSync(r.path)), want);
});

test("the Asset Studio record must agree with the manifest sha256 before any download", async () => {
  const calls = [];
  const r = await pullAsset({ assetId: "a", sha256: "f".repeat(64), cacheDir: tmp(), token: "t", fetchImpl: fakeFetch({ calls }) });
  assert.equal(r.ok, false);
  assert.match(r.failure, /Asset Studio record sha256 7f1c54c3[0-9a-f]+ != manifest f{64}/);
  assert.equal(calls.filter((c) => c.url.endsWith("/media")).length, 0);
});

test("an unreachable studio or a missing token is reported as unreachable, never as a pass", async () => {
  const down = async () => { throw new TypeError("fetch failed"); };
  const a = await pullAsset({ assetId: "a", sha256: "a".repeat(64), cacheDir: tmp(), token: "t", fetchImpl: down });
  assert.deepEqual([a.ok, a.unreachable], [false, true]);
  const b = await pullAsset({ assetId: "a", sha256: "a".repeat(64), cacheDir: tmp(), token: null, fetchImpl: down });
  assert.deepEqual([b.ok, b.unreachable], [false, true]);
  assert.match(b.failure, /no Asset Studio token/);
});

test("a refused token (401/403) is a hard FAIL 'studio auth failed', never unreachable", async () => {
  for (const status of [401, 403]) {
    const r = await pullAsset({ assetId: "a", sha256: "a".repeat(64), cacheDir: tmp(), token: "t",
      fetchImpl: async () => new Response("refused", { status }) });
    assert.equal(r.ok, false);
    assert.equal(r.unreachable, undefined, `http ${status} must not count as unreachable`);
    assert.match(r.failure, new RegExp(`studio auth failed \\(http ${status}\\)`));
  }
});

test("every Asset Studio request carries an abort signal; every token-route call is bounded to 20 s", async () => {
  const want = sha(BYTES);
  const signals = [];
  const f = async (url, init) => {
    signals.push(init?.signal);
    return String(url).endsWith("/media") ? new Response(BYTES, { status: 200 })
      : new Response(JSON.stringify({ asset: { ...RECORD, sha256: want } }), { status: 200 });
  };
  const r = await pullAsset({ assetId: "a", sha256: want, cacheDir: tmp(), token: "t", fetchImpl: f });
  assert.equal(r.ok, true, r.failure);
  assert.equal(signals.length, 2);
  assert.ok(signals.every((x) => x instanceof AbortSignal), "record and media fetches both need AbortSignal.timeout");
  const seen = [];
  studioToken({ env: {}, run: (cmd, _args, o) => { seen.push([cmd, o?.timeout]); return { status: 1, stdout: "" }; } });
  assert.ok(seen.length >= 1);
  assert.ok(seen.every(([, t]) => t === 20000), JSON.stringify(seen));
});

test("pullEntries lists only entries with a pull block", () => {
  const m = { entries: { a: { scene: "res://assets/a.glb" }, b: { pull: { assetStudioAsset: "id", tag: "t", sha256: "x" } } } };
  assert.deepEqual(pullEntries(m), [{ id: "b", assetId: "id", tag: "t", sha256: "x" }]);
});

test("studioToken prefers STUDIO_TOKEN and runs nothing when it is set; a failed kubectl gives null", () => {
  let ran = 0;
  const run = () => { ran++; return { status: 1, stdout: "" }; };
  assert.equal(studioToken({ env: { STUDIO_TOKEN: "abc" }, run }), "abc");
  assert.equal(ran, 0);
  assert.equal(studioToken({ env: {}, run }), null);
});

test("CLI: empty cache + unreachable studio exits 2 and says local Gate 1 never skips", () => {
  const r = spawnSync("node", [join(ROOT, "scripts/studio-pull.mjs"), "--manifest", join(FIX, "pull-manifest.json"), "--cache-dir", tmp()], {
    cwd: ROOT, encoding: "utf8", timeout: 20000,
    env: { ...process.env, STUDIO_TOKEN: "t", ATLAS_STUDIO_URL: "http://127.0.0.1:9" },
  });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /local Gate 1 never skips/);
  assert.match(r.stdout, /only CI sets ATLAS_SKIP_STUDIO=1/);
});

test("the cache dir and everything Godot or the strip writes into it are gitignored", () => {
  for (const p of [
    "game-client/studio-cache/x.glb", "game-client/studio-cache/x.glb.import",
    "game-client/studio-cache/x_albedo.jpg", "game-client/studio-cache/renders/x.strip.png",
    "game-client/studio-cache/renders/x.strip.png.import",
  ]) {
    assert.equal(spawnSync("git", ["check-ignore", "-q", p], { cwd: ROOT }).status, 0, `${p} is not ignored`);
  }
});

test("no Godot export preset can bundle studio-cache (every exclude_filter names studio-cache/*)", () => {
  const cfg = readFileSync(join(ROOT, "game-client/export_presets.cfg"), "utf8");
  const lines = cfg.split("\n").filter((l) => l.startsWith("exclude_filter="));
  assert.ok(lines.length >= 1, "export_presets.cfg has no exclude_filter key");
  for (const l of lines) assert.match(l, /studio-cache\/\*/, l);
});
```

Verify-Cmd: `cd $WT && node --test scripts/tests/studio-pull.test.mjs`

Expected FAIL: `ERR_MODULE_NOT_FOUND … scripts/lib/studio-pull.mjs`.

**Step 2: minimal implementation**

`.gitignore` (append):

```gitignore
# F-174 pull-only Asset Studio assets. This repo is PUBLIC: owner-generated glbs, their Godot
# .import sidecars, extracted textures and renders live here and must never be committed.
game-client/studio-cache/
```

`scripts/lib/studio-token.mjs`:

```js
// Asset Studio bearer token (F-174). Same source as
// ~/asset-studio-private/atlas-3d-plan/atlas_char/batch.py token(): STUDIO_TOKEN, else a dev token
// minted from the local orbstack cluster's JWT secret by asset-studio/scripts/dev-token.mjs.
// Never prints the token. Returns null when neither route works.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export function studioToken({ env = process.env, run = spawnSync } = {}) {
  if (env.STUDIO_TOKEN) return env.STUDIO_TOKEN;
  try {
    const k = ["--context", "orbstack", "-n", "asset-studio"];
    const opt = { encoding: "utf8", timeout: 20000 }; // a wedged cluster must not hang Gate 1
    const sec = run("kubectl", [...k, "get", "secret", "asset-studio-secret", "-o", "json"], opt);
    const cm = run("kubectl", [...k, "get", "configmap", "asset-studio-config", "-o", "json"], opt);
    if (sec.status !== 0 || cm.status !== 0) return null;
    const jwt = Buffer.from(JSON.parse(sec.stdout).data.JWT_SECRET_KEY, "base64").toString("utf8");
    const email = JSON.parse(cm.stdout).data.OWNER_EMAILS.split(",")[0].trim();
    const script = join(homedir(), "workspace/repos/asset-studio/scripts/dev-token.mjs");
    const r = run("node", [script], { ...opt, env: { ...env, JWT_SECRET_KEY: jwt, OWNER_EMAIL: email } });
    const tok = (r.stdout ?? "").trim();
    return r.status === 0 && tok ? tok : null;
  } catch {
    return null;
  }
}
```

`scripts/lib/studio-pull.mjs`:

```js
// F-174 "pull, don't commit". Owner-generated assets stay in Asset Studio. This repo is public,
// so a manifest entry records only asset id, tag and sha256. The bytes are fetched into the
// gitignored game-client/studio-cache/ and trusted only after they hash to that sha256.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const STUDIO_CLIENT = "atlas-world";
export const studioUrl = (env = process.env) =>
  (env.ATLAS_STUDIO_URL || "http://asset-studio.joymify.local.com").replace(/\/$/, "");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const FETCH_MS = 30000; // every Asset Studio request is bounded

export function isCached(cacheDir, sha256) {
  const p = join(cacheDir, `${sha256}.glb`);
  return existsSync(p) && hash(readFileSync(p)) === sha256;
}

export function pullEntries(manifest) {
  return Object.entries(manifest?.entries ?? {})
    .filter(([, e]) => e && typeof e.pull === "object" && e.pull !== null)
    .map(([id, e]) => ({ id, assetId: e.pull.assetStudioAsset, tag: e.pull.tag, sha256: e.pull.sha256 }));
}

export async function fetchAssetRecord(assetId, { token, fetchImpl = fetch, baseUrl = studioUrl() }) {
  const res = await fetchImpl(
    `${baseUrl}/v1/library/assets/${encodeURIComponent(assetId)}?clientId=${STUDIO_CLIENT}`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(FETCH_MS) },
  );
  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error(`studio auth failed (http ${res.status}): Asset Studio refused the token; mint a fresh one (STUDIO_TOKEN or the orbstack dev-token route)`), { http: res.status, auth: true });
  }
  if (!res.ok) throw Object.assign(new Error(`asset ${assetId}: http ${res.status}`), { http: res.status });
  const body = await res.json();
  return body.asset ?? body;
}

export async function pullAsset({ assetId, sha256: want, cacheDir, token, fetchImpl = fetch, baseUrl = studioUrl(), record = null }) {
  const dest = join(cacheDir, `${want}.glb`);
  if (isCached(cacheDir, want)) return { ok: true, path: dest, cached: true };
  if (!token) {
    return { ok: false, unreachable: true, failure: "no Asset Studio token (STUDIO_TOKEN unset and the kubectl route failed)" };
  }
  let bytes;
  try {
    const rec = record ?? (await fetchAssetRecord(assetId, { token, fetchImpl, baseUrl }));
    if (rec.sha256 !== want) {
      return { ok: false, failure: `Asset Studio record sha256 ${rec.sha256} != manifest ${want} (asset ${assetId})` };
    }
    const res = await fetchImpl(`${baseUrl}${rec.mediaUrl}`,
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(FETCH_MS) });
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error(`studio auth failed (http ${res.status}) on the media route`), { http: res.status, auth: true });
    }
    if (!res.ok) throw Object.assign(new Error(`media http ${res.status}`), { http: res.status });
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    // 401/403: the studio is up and refused us. That is a hard FAIL, never "unreachable".
    if (err.auth) return { ok: false, failure: err.message };
    // Any other 4xx (404: wrong asset id) is a hard failure too.
    if (err.http && err.http < 500) return { ok: false, failure: `asset ${assetId}: ${err.message}` };
    // Network error, AbortSignal timeout, 5xx: unreachable (exit 2; local Gate 1 still FAILS on it).
    return { ok: false, unreachable: true, failure: `Asset Studio unreachable at ${baseUrl} (${err.message})` };
  }
  const got = hash(bytes);
  if (got !== want) return { ok: false, failure: `sha256: ${got} != recorded ${want} (asset ${assetId}); nothing written` };
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(`${dest}.part`, bytes);
  renameSync(`${dest}.part`, dest);
  return { ok: true, path: dest, cached: false };
}
```

`scripts/studio-pull.mjs`:

```js
#!/usr/bin/env node
// Fetch every pull-only manifest entry (F-174) into game-client/studio-cache/ and verify sha256.
// Exit 0: all present. 1: sha mismatch / bad record / studio auth failed. 2: unreachable or no token.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isCached, pullAsset, pullEntries } from "./lib/studio-pull.mjs";
import { studioToken } from "./lib/studio-token.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const manifestPath = resolve(flag("--manifest") ?? join(ROOT, "game-client/assets/manifest.json"));
const cacheDir = resolve(flag("--cache-dir") ?? process.env.ATLAS_STUDIO_CACHE_DIR ?? join(ROOT, "game-client/studio-cache"));

const rows = pullEntries(JSON.parse(readFileSync(manifestPath, "utf8")));
const token = rows.some((r) => !isCached(cacheDir, r.sha256)) ? studioToken() : null; // warm cache: no token, no kubectl
let hard = false;
let soft = false;
for (const row of rows) {
  const r = await pullAsset({ assetId: row.assetId, sha256: row.sha256, cacheDir, token });
  if (r.ok) {
    console.log(`✅ ${row.id}: ${r.cached ? "cached" : "pulled"} ${row.sha256.slice(0, 12)}… (tag ${row.tag})`);
    continue;
  }
  console.log(`❌ ${row.id}: ${r.failure}`);
  if (r.unreachable) soft = true;
  else hard = true;
}
if (soft && !hard) {
  console.log("Asset Studio is unreachable and the cache lacks the bytes. Start Asset Studio or set STUDIO_TOKEN: local Gate 1 never skips pull-only checks; only CI sets ATLAS_SKIP_STUDIO=1.");
}
console.log(`studio-pull: ${rows.length} pull-only entr${rows.length === 1 ? "y" : "ies"}`);
process.exit(hard ? 1 : soft ? 2 : 0);
```

`scripts/system-deps.json`: add the binary this task now shells out to, as its `_comment` rule demands (`required: false`, because only the token fallback uses it, and only when `STUDIO_TOKEN` is unset):

```json
    {
      "name": "kubectl",
      "package": "kubectl (Kubernetes CLI)",
      "required": false,
      "requiredNote": "Only scripts/lib/studio-token.mjs uses it (each call bounded to 20 s), and only when STUDIO_TOKEN is unset, to mint an Asset Studio dev token from the local orbstack cluster. A missing kubectl means studio-pull exits 2 (unreachable), which Gate 1 FAILS on.",
      "usedBy": ["scripts/lib/studio-token.mjs"],
      "verify": "kubectl version --client",
      "macos": { "install": "brew install kubectl" },
      "debian": { "install": "sudo apt-get update -qq && sudo apt-get install -y -qq kubectl" }
    }
```

`game-client/export_presets.cfg` line 11: `exclude_filter=""` → `exclude_filter="studio-cache/*"` (the Godot export key for exclusions; one preset today). A future `.pck` export then never bundles private bytes, even on a machine with a warm cache.

**Step 3: run → PASS** (Verify-Cmd). Then `node scripts/check-system-deps.mjs` prints the kubectl note and `RESULT: all required system binaries are present.`

**Step 4: real pull** (this fills `$SRC_GLB` for Tasks 1-3):

```bash
cd $WT && node scripts/studio-pull.mjs --manifest scripts/tests/fixtures/studio/pull-manifest.json; echo "exit=$?"
shasum -a 256 "$SRC_GLB"                     # → 7f1c54c3…c75f
git status --porcelain game-client/studio-cache   # → empty (ignored)
```

Expected: `✅ npc:lantern_hollow_watch_sergeant: pulled 7f1c54c37073… (tag p4b-11050912)` and `exit=0`. A second run prints `cached`. **Verified while planning (2026-11-06):** the API record for asset `01a1a97a…` has sha256 `7f1c54c3…c75f`, size 2,645,916 and tag `p4b-11050912`, and the signed `mediaUrl` returned bytes with exactly that sha256. That sha is **not** the pack's local `out.glb` (`0ac13d97…`). The JSON chunk (clips, nodes, skin) is identical, and 1,742 bytes of the binary buffer differ. The approved asset is the source of truth, so every task uses `7f1c54c3…`.

**Step 5: README.** In the repo `README.md` §"3. Build & Run Godot", add "Pull-only assets": `node scripts/studio-pull.mjs`, the cache path, the exit codes, the token sources (`STUDIO_TOKEN`, else the orbstack dev-token route), and the rule that this repo is public, so pull-only bytes are never committed.

**Step 6: commit** `feat(assets): pull-only Asset Studio fetch with sha256 verify into a gitignored cache (F-174)` (includes `export_presets.cfg`).

**Phase gate:** suite green; `$SRC_GLB` exists and hashes to `$SERGEANT_SHA`; `git ls-files game-client/studio-cache` prints nothing.

---

## Task 1: `pipelineCharacter` validate kind + Mixamo rig reference

**Files:**
- Create: `atelier/asset-forge/rig-reference/mixamo-65.bones.json`
- Modify: `atelier/asset-forge/forge.config.json` (the `kinds` object, lines 12-31)
- Modify: `atelier/asset-forge/validate.mjs`: `checkSkeletonExtras` loop (lines 198-226), `validateGlb` clips step (lines 393-406), skeleton step (lines 413-414), triangle step (after line 457), plus a new export
- Test: `atelier/asset-forge/tests/validate.test.mjs` (append)

**Interfaces:**
- Consumes: `validateGlb(glbPath, {kind, tier, anims, configDir, licenseLedger}) → {failures: string[], warnings: string[]}` (unchanged signature).
- Produces: `export function stateKeysForKind(kindConfig): string[]` (requiredStates followed by optionalStates); kind config keys `optionalStates: string[]`, `maxBytes: number`, `rigReference: string[]` (per kind, relative to the config dir); rig-ref key `fixedExtras: Record<string, string>` (extra joint → required parent).

**Step 1: failing tests**

```js test:atelier/asset-forge/tests/validate.test.mjs
// --- F-174 pipelineCharacter -------------------------------------------------
import { NodeIO } from "@gltf-transform/core";
import { stateKeysForKind } from "../validate.mjs";

const REPO = path.resolve(new URL("../../..", import.meta.url).pathname);
// Pull-only (F-174): the sergeant is never in git. Task 1a's `node scripts/studio-pull.mjs` fills
// the gitignored cache; ATLAS_SERGEANT_GLB overrides the path.
const SERGEANT_SHA = "7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f";
const SERGEANT =
  process.env.ATLAS_SERGEANT_GLB ??
  path.join(REPO, `game-client/studio-cache/${SERGEANT_SHA}.glb`);
// ATLAS_SKIP_STUDIO=1 with a cold cache: the sergeant cases are SKIPPED (visible in the TAP
// output), never silently passed. Without it, a missing cache fails loudly in assertRealGlb.
// Only CI sets the variable; local Gate 1 refuses it before this suite runs (Task 8).
const SERGEANT_SKIP = process.env.ATLAS_SKIP_STUDIO === "1" && !existsSync(SERGEANT)
  ? "ATLAS_SKIP_STUDIO=1 and the sergeant is not in game-client/studio-cache"
  : false;
const SERGEANT_ANIMS = {
  idle: "idle", walk: "walk", run: "run",
  attack: ["attack", "attack_2", "attack_3"], death: "death",
  combat_idle: "block_idle", block: "block", hit: "hit",
};

function assertRealGlb(p) {
  assert.ok(existsSync(p), `${p} missing (the pull-only sergeant: run node scripts/studio-pull.mjs)`);
  assert.notEqual(readFileSync(p).subarray(0, 4).toString(), "vers", `${p} is a Git LFS pointer — run git lfs pull`);
}

test("pipelineCharacter: the sergeant passes with list + optional anims", { skip: SERGEANT_SKIP }, async () => {
  assertRealGlb(SERGEANT);
  // validate under the shipped basename so the naming rule is exercised for real
  const dir = mkdtempSync(path.join(tmpdir(), "pc-"));
  const staged = path.join(dir, "lantern_hollow_watch_sergeant.glb");
  writeFileSync(staged, readFileSync(SERGEANT));
  try {
    const r = await validateGlb(staged, { kind: "pipelineCharacter", anims: SERGEANT_ANIMS });
    assert.deepEqual(r.failures, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pipelineCharacter: a missing attack variant clip fails naming the clip", { skip: SERGEANT_SKIP }, async () => {
  assertRealGlb(SERGEANT);
  const r = await validateGlb(SERGEANT, {
    kind: "pipelineCharacter",
    anims: { ...SERGEANT_ANIMS, attack: ["attack", "attack_9"] },
  });
  assert.match(r.failures.join("\n"), /attack.*attack_9/);
});

test("pipelineCharacter: an optional state mapped to a missing clip fails", { skip: SERGEANT_SKIP }, async () => {
  assertRealGlb(SERGEANT);
  const r = await validateGlb(SERGEANT, {
    kind: "pipelineCharacter",
    anims: { ...SERGEANT_ANIMS, hit: "hit_RENAMED" },
  });
  assert.match(r.failures.join("\n"), /hit.*hit_RENAMED/);
});

test("pipelineCharacter: a KayKit mob glb fails on skeleton (per-kind rig ref)", async () => {
  const orc = path.join(REPO, "game-client/assets/characters/orc_brute.glb");
  assertRealGlb(orc);
  const r = await validateGlb(orc, { kind: "pipelineCharacter", tier: "bespoke" });
  assert.match(r.failures.join("\n"), /^skeleton/m);
});

test("pipelineCharacter: a 16k-triangle copy of the sergeant fails the triangle budget", { skip: SERGEANT_SKIP }, async () => {
  assertRealGlb(SERGEANT);
  const io = new NodeIO();
  const doc = await io.read(SERGEANT);
  const prim = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
    .find((p) => p.getAttribute("JOINTS_0") && p.getIndices());
  const idx = prim.getIndices();
  const src = idx.getArray();
  const extra = 1600 * 3; // 14,448 + 1,600 = 16,048 triangles
  const grown = new src.constructor(src.length + extra);
  grown.set(src);
  grown.set(src.subarray(0, extra), src.length);
  idx.setArray(grown);
  const dir = mkdtempSync(path.join(tmpdir(), "pc16k-"));
  const out = path.join(dir, "sergeant_16k.glb");
  await io.write(out, doc);
  try {
    const r = await validateGlb(out, { kind: "pipelineCharacter", anims: SERGEANT_ANIMS });
    assert.match(r.failures.join("\n"), /triangles: 16048 > 15000/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pipelineCharacter: bytes over maxBytes fail; handslot.r with a wrong parent fails topology", { skip: SERGEANT_SKIP }, async () => {
  assertRealGlb(SERGEANT);
  const cfgDir = mkdtempSync(path.join(tmpdir(), "pccfg-"));
  const real = JSON.parse(readFileSync(new URL("../forge.config.json", import.meta.url), "utf8"));
  const ref = JSON.parse(readFileSync(new URL("../rig-reference/mixamo-65.bones.json", import.meta.url), "utf8"));
  mkdirSync(path.join(cfgDir, "rig-reference"));
  writeFileSync(path.join(cfgDir, "rig-reference/mixamo-65.bones.json"),
    JSON.stringify({ ...ref, fixedExtras: { "handslot.r": "mixamorig:Head" } }));
  real.kinds.pipelineCharacter.maxBytes = 1000;
  writeFileSync(path.join(cfgDir, "forge.config.json"), JSON.stringify(real));
  try {
    const r = await validateGlb(SERGEANT, { kind: "pipelineCharacter", anims: SERGEANT_ANIMS, configDir: cfgDir });
    const all = r.failures.join("\n");
    assert.match(all, /bytes: \d+ > 1000 budget/);
    assert.match(all, /skeleton-topology: handslot\.r parent is prop_weapon_r, expected mixamorig:Head/);
  } finally {
    rmSync(cfgDir, { recursive: true, force: true });
  }
});

test("stateKeysForKind lists required then optional states", () => {
  assert.deepEqual(
    stateKeysForKind({ requiredStates: ["idle"], optionalStates: ["hit"] }),
    ["idle", "hit"],
  );
  assert.deepEqual(stateKeysForKind({ requiredStates: ["idle"] }), ["idle"]);
});

test("existing character kind is unchanged: good.glb still passes", async () => {
  const r = await validateGlb(fx("good.glb"), { kind: "character" });
  assert.deepEqual(r.failures, []);
});
```

Verify-Cmd: `cd $WT/atelier/asset-forge && (test -d node_modules || npm ci --no-audit --no-fund) && node tests/make-fixtures.mjs && node --test tests/validate.test.mjs` (needs Task 1a's pull; the default path is the cache)

Expected FAIL: `SyntaxError: The requested module '../validate.mjs' does not provide an export named 'stateKeysForKind'` (the whole file fails to load).

**Step 2: minimal implementation**

1. Create the rig reference from the real glb, keeping the 65 Mixamo joints as core:

```bash
cd $WT/atelier/asset-forge && node -e '
import("./lib/gltf.mjs").then(async (m) => {
  const doc = await m.loadGlb(process.argv[1]);
  const all = m.jointParents(doc);
  const joints = m.jointNames(doc).filter((n) => n.startsWith("mixamorig:"));
  if (joints.length !== 65) throw new Error(`expected 65 mixamo joints, got ${joints.length}`);
  const parents = Object.fromEntries(joints.map((j) => [j, all[j] ?? null]));
  const ref = {
    joints, parents, allowExtras: true,
    secParents: [], sleeveParents: [],
    propParents: ["mixamorig:RightHand", "mixamorig:LeftHand"],
    fixedExtras: { "handslot.r": "prop_weapon_r" },
  };
  require("node:fs").writeFileSync("rig-reference/mixamo-65.bones.json", JSON.stringify(ref, null, 2) + "\n");
  console.log("wrote mixamo-65 with", joints.length, "joints");
});' "$SRC_GLB"
```

2. `forge.config.json`: add after `mvpBoss`:

```json
    "pipelineCharacter": {
      "heightRange": [0.95, 1.15],
      "maxTriangles": 15000,
      "maxBytes": 2936012,
      "maxTextureSize": 1024,
      "requiredStates": ["idle", "walk", "run", "attack", "death"],
      "optionalStates": ["combat_idle", "block", "hit", "ready_in", "ready_out"],
      "rigReference": ["rig-reference/mixamo-65.bones.json"]
    }
```

3. `validate.mjs`:

```js
/** Every anims key a kind accepts: requiredStates, then optionalStates. */
export function stateKeysForKind(kindConfig) {
  return [...kindConfig.requiredStates, ...(kindConfig.optionalStates ?? [])];
}
```

In `checkSkeletonExtras`, first lines of `for (const name of extras) {`:

```js
    const parent = parents[name] ?? null;
    if (Object.hasOwn(ref.fixedExtras ?? {}, name)) {
      const expected = ref.fixedExtras[name];
      if (parent !== expected) {
        violations.push(["skeleton-topology", `${name} parent is ${parent ?? "none"}, expected ${expected}`]);
      }
      continue;
    }
```

(and delete the now-duplicate `const parent = …` line below it).

Replace step 4 (clips):

```js
  // 4. Animation clips: every required state, plus every optional state the
  // map names. A value is one clip name or a list of variants (all must exist).
  const clipMap = anims ?? config.defaultClipMap;
  const clipNames = listClipNames(doc);
  const optionalMapped = (kindConfig.optionalStates ?? []).filter((s) => clipMap[s] != null);
  for (const state of [...kindConfig.requiredStates, ...optionalMapped]) {
    const mapped = clipMap[state];
    const names = Array.isArray(mapped) ? mapped : [mapped];
    if (names.length === 0) names.push(undefined);
    for (const mappedName of names) {
      if (!mappedName || !clipNames.includes(mappedName)) {
        report(
          "clips",
          `state '${state}' -> expected clip '${mappedName}' not found (have: ${
            clipNames.join(", ") || "none"
          })`,
        );
      }
    }
  }
```

Skeleton step: before `checkSkeleton(...)`:

```js
  const rigReferencePaths = Array.isArray(kindConfig.rigReference)
    ? kindConfig.rigReference.map((p) => path.join(config.configDir, p))
    : config.rigReferencePaths;
```

and pass `rigReferencePaths` instead of `config.rigReferencePaths`.

After the triangle check:

```js
  // 6b. Byte budget (kinds that declare one).
  if (kindConfig.maxBytes != null && bytes.length > kindConfig.maxBytes) {
    report("bytes", `${bytes.length} > ${kindConfig.maxBytes} budget`);
  }
```

**Step 3: run → PASS** (same Verify-Cmd). Also run the whole suite so `character`/`chibiPlayer`/`mvpBoss` stay green: `cd $WT/atelier/asset-forge && npm test`.

If the sergeant fails `skin-weights` (the extras path runs `checkSkinWeights`), stop and report it. Do not loosen the rule.

**Step 4: README.** `atelier/asset-forge/README.md` §"Stage: VALIDATE": add a `pipelineCharacter` row (budgets above, `optionalStates`, per-kind `rigReference`, `fixedExtras`) and the CLI line `node validate.mjs <glb> --kind pipelineCharacter --anims '<json>'`.

**Step 5: commit** `feat(asset-forge): pipelineCharacter kind + mixamo-65 rig reference (F-174)`.

**Phase gate:** suite green; `node validate.mjs "$SRC_GLB" --kind pipelineCharacter --anims '<SERGEANT_ANIMS json>'` prints no FAIL (the cache name `<sha>.glb` is lowercase hex and matches `NAME_PATTERN` `^[a-z0-9_]+\.glb$`, so not even `naming`) and exits 0. Wave A review.

---

## Task 2: Intake writes a pull-only sergeant entry (Asset Studio provenance, no committed bytes)

**Files:**
- Modify: `atelier/asset-forge/intake.mjs` (rewritten whole; the full file is in Step 2, so nothing is left to infer from line numbers)
- Modify: `atelier/asset-forge/forge.config.json`: top-level `pipelineClips` + `pipelineClipMap`
- Create: `scripts/lib/pull-entry.mjs`, `scripts/tests/pull-entry.test.mjs`, `atelier/asset-forge/tests/studio-report.fixture.json` (**not** under `tests/fixtures/`: `atelier/asset-forge/.gitignore:2` ignores `fixtures/`, so a fixture there is never committed), `scripts/tests/bake-thumbnails-pull.test.mjs`
- Modify: `scripts/bake_thumbnails.mjs` (`collectJobs` skips pull entries, lines 109-128; export `collectJobs`; run `main()` only when executed directly, lines 377-383)
- Modify: `scripts/lib/license-policy.mjs` (a `studio-private` branch); `scripts/check_asset_manifest.mjs`: (B) pull branch, (U) skip, new guard **(W)**, header comment; `.github/workflows/ci.yml:70` (`env: ATLAS_SKIP_STUDIO: "1"` on the manifest-gate step plus an `echo "::warning …"` line, because CI can never reach the local Asset Studio; local Gate 1 refuses the variable, Task 8)
- Modify: `content/asset-taxonomy.json` (section `character` → `kinds: ["character", "pipelineCharacter"]`), `game-client/assets/render-spec.json` (`kindDefaultRender.pipelineCharacter = "model3d"`), `art-source/LICENSES.md` (one row, **studio-private**, never CC0)
- Test: `atelier/asset-forge/tests/intake.test.mjs` (append)

There is no `approvals/*.json` and no hand-written approval record. The recorded sha256 comes from the Asset Studio API record of the approved asset (`asset.sha256`), never from `sheet.json` or from hashing the local file. Rev 1 compared the file with itself. A batch report row supplies the asset id and tag (`report.json` rows carry `slug, status, asset, tag`, with no sha). The anims come from `pipelineClipMap`, so a new pipeline character needs zero hand-written JSON.

**Interfaces:**
- Consumes: `stateKeysForKind` (Task 1); `pullAsset`, `fetchAssetRecord` (Task 1a).
- Produces:
  - `intake(glbPath | null, {key, license, root, kind, dryRun, anims, driftGate, destName?: string, studio?: {assetId, tag, token?, fetchImpl?, baseUrl?}})`. With `studio`, `glbPath` is ignored. Intake fetches the record and requires `tag ∈ record.tags`. It takes the sha256 from the record, pulls into `<root>/game-client/studio-cache/` through `pullAsset`, and validates a staged copy named `destName`. It writes a **pull-only** entry with `license: "studio-private"` and copies nothing into `game-client/assets/`. Normalize runs in memory only and never writes the cache file. Rollback restores the manifest and **never** deletes the cache file. `dryRun` in studio mode fetches the record and checks the tag, then reports the planned pull and entry; it never downloads the media and writes nothing. The `.import` reminder is not printed in studio mode (nothing is committed). Every result carries `seconds` (intake wall time); a studio result also carries `credits: {spent, est} | null`. The last action is `intake: done in N.N s` in copy mode, and `intake: done in N.N s · credits spent S / est E (batch <name> total) · gen G s` (or `· credits n/a (no batch report)`) in studio mode.
  - `rowFromReport(report, slug) → {assetId, tag, cost: {batch, creditsSpent, creditsEst, genSeconds}}`. `cost` comes from the report's top-level `name`, `credits_spent`, `credits_est` and the row's `seconds`. It throws `slug <slug> not in report` or `slug <slug> status <s>, need PASS`.
  - `defaultAnimsFor(kind, config) → object | null`: `config.pipelineClipMap` for `pipelineCharacter`, null otherwise.
  - CLI: `--from-report <report.json> --slug <slug>` or `--studio-asset <id> --tag <tag>`, plus `--dest-name <file.glb>`. In studio mode `--license` is not taken, because the license is always `studio-private`.
  - `scripts/lib/pull-entry.mjs`: `PULL_SCENE_PREFIX = "res://studio-cache/"`; `isPullOnly(entry) → boolean`, which needs `pull.assetStudioAsset`, `pull.tag`, a 64-hex `pull.sha256` and `scene === "res://studio-cache/<sha256>.glb"`; `checkPullEntry(id, entry, gameClient, failures, {skipStudio}) → "ok" | "skipped" | "failed"`; `checkNoTrackedCache(repoRoot, failures)` = guard (W): nothing under `game-client/studio-cache/` is tracked, `game-client/assets/.thumbs/index.json` has no key containing `studio-cache/`, and no tracked `game-client/**/*.import|*.tscn|*.tres` contains `res://studio-cache/`.
  - `scripts/bake_thumbnails.mjs`: `export function collectJobs(spec, {assets, gameClient, artRoot} = {})` (defaults: the real paths); a manifest entry with a `pull` block is never queued.
- Manifest entry shape (written by intake):

```json
"npc:lantern_hollow_watch_sergeant": {
  "scene": "res://studio-cache/7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f.glb",
  "source": "Asset Studio library asset 01a1a97a-8e45-71d6-885f-459aa1cebf7f (client atlas-world); bytes not in this repo",
  "license": "studio-private",
  "tier": "bespoke",
  "kind": "pipelineCharacter",
  "pull": { "from": "asset-studio", "assetStudioAsset": "01a1a97a-8e45-71d6-885f-459aa1cebf7f", "tag": "p4b-11050912", "sha256": "7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f" },
  "gen": { "model": "tripo", "provider": "tripo", "rig": "mixamo", "clips": "mixamo" },
  "anims": { "idle": "idle", "walk": "walk", "run": "run", "attack": ["attack", "attack_2", "attack_3"], "death": "death", "combat_idle": "block_idle", "block": "block", "hit": "hit" }
}
```

(`gen` is built from the record's tags: `tripo` → model/provider, `mixamo` → rig/clips. Guard (N) only types `gen.model` and the numeric fields, `check_asset_manifest.mjs:328-350`, so the extra string fields pass.)

**Step 1: failing tests**

```json test:atelier/asset-forge/tests/studio-report.fixture.json
{
  "name": "fixture",
  "credit_cap": 100,
  "credits_est": 40,
  "credits_spent": 35,
  "characters": [
    { "slug": "npc-fixture-ok", "status": "PASS", "seconds": 209.4, "asset": "a-1", "tag": "t-1" },
    { "slug": "npc-fixture-failed", "status": "FAIL", "seconds": 12.0, "asset": "a-2", "tag": "t-2" }
  ]
}
```

```js test:atelier/asset-forge/tests/intake.test.mjs
// --- F-174 pull-only studio intake --------------------------------------------
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defaultAnimsFor, rowFromReport } from "../intake.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const STUDIO_RECORD = JSON.parse(readFileSync(
  new URL("../../../scripts/tests/fixtures/studio/sergeant-asset-record.json", import.meta.url), "utf8")).asset;
// Not under tests/fixtures/: atelier/asset-forge/.gitignore ignores fixtures/.
const REPORT_PATH = fileURLToPath(new URL("./studio-report.fixture.json", import.meta.url));
const REPORT = JSON.parse(readFileSync(REPORT_PATH, "utf8"));

// Record route → `record`, media route → the bytes of good.glb. `calls` logs every URL.
function studioDouble(record, calls = []) {
  const body = readFileSync(fx("good.glb"));
  return async (url) => {
    calls.push(String(url));
    return String(url).endsWith("/media")
      ? new Response(body, { status: 200 })
      : new Response(JSON.stringify({ asset: record }), { status: 200 });
  };
}
const goodRecord = () => ({ ...STUDIO_RECORD, sha256: sha(readFileSync(fx("good.glb"))), tags: ["tripo", "mixamo", "t-1"] });
const studio = (record, over = {}) => ({ assetId: "a-1", tag: "t-1", token: "t", fetchImpl: studioDouble(record), ...over });
// Capture console.log while `fn` runs (the .import reminder is a console line, not an action).
async function captureLog(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => { lines.push(a.join(" ")); };
  try { return { value: await fn(), lines }; } finally { console.log = orig; }
}

test("studio: bytes whose sha256 differs from the Asset Studio record are refused with zero side effects", async () => {
  const { root, manifestPath } = makeSandbox();
  const before = readFileSync(manifestPath, "utf8");
  try {
    // The committed fixture record says 7f1c54c3…; the double serves good.glb, so the hash cannot match.
    const r = await intake(null, {
      key: "npc:x", root, destName: "good.glb", studio: studio({ ...STUDIO_RECORD, tags: ["t-1"] }),
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.match(r.failures.join(), /sha256: [0-9a-f]{64} != recorded 7f1c54c3/);
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    assert.equal(existsSync(path.join(root, "game-client/studio-cache")), false);
    assert.equal(existsSync(path.join(root, "game-client/assets/characters/good.glb")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio: a tag the asset does not carry is refused before any download", async () => {
  const { root } = makeSandbox();
  const calls = [];
  try {
    const r = await intake(null, {
      key: "npc:x", root, destName: "good.glb",
      studio: studio(goodRecord(), { tag: "p-other", fetchImpl: studioDouble(goodRecord(), calls) }),
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, false);
    assert.match(r.failures.join(), /tag p-other not in asset a-1 tags/);
    assert.equal(calls.filter((u) => u.endsWith("/media")).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio: a matching sha writes a pull-only entry, caches the bytes, copies nothing into assets/, prints no .import reminder, and reports time + credits", async () => {
  const { root, manifestPath } = makeSandbox();
  try {
    const rec = goodRecord();
    const { cost } = rowFromReport(REPORT, "npc-fixture-ok");
    const { value: r, lines } = await captureLog(() => intake(null, {
      key: "npc:x", root, destName: "good.glb", studio: studio(rec, { cost }), driftGate: async () => ({ ok: true }),
    }));
    assert.equal(r.ok, true, r.failures?.join());
    const e = JSON.parse(readFileSync(manifestPath, "utf8")).entries["npc:x"];
    assert.equal(e.scene, `res://studio-cache/${rec.sha256}.glb`);
    assert.equal(e.license, "studio-private");
    assert.deepEqual(e.pull, { from: "asset-studio", assetStudioAsset: "a-1", tag: "t-1", sha256: rec.sha256 });
    assert.deepEqual(e.gen, { model: "tripo", provider: "tripo", rig: "mixamo", clips: "mixamo" });
    assert.ok(existsSync(path.join(root, `game-client/studio-cache/${rec.sha256}.glb`)));
    assert.equal(existsSync(path.join(root, "game-client/assets/characters/good.glb")), false);
    assert.equal(lines.some((l) => /Commit the Godot \.import sidecar/.test(l)), false, "pull mode commits nothing");
    assert.equal(typeof r.seconds, "number");
    assert.deepEqual(r.credits, { spent: 35, est: 40 });
    assert.match(r.actions.at(-1), /^intake: done in \d+\.\d s · credits spent 35 \/ est 40 \(batch fixture total\) · gen 209\.4 s$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio without a batch report: the done line says credits n/a", async () => {
  const { root } = makeSandbox();
  try {
    const r = await intake(null, {
      key: "npc:x", root, destName: "good.glb", studio: studio(goodRecord()), driftGate: async () => ({ ok: true }),
    });
    assert.equal(r.ok, true, r.failures?.join());
    assert.equal(r.credits, null);
    assert.match(r.actions.at(-1), /^intake: done in \d+\.\d s · credits n\/a \(no batch report\)$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio: a forced failure after the pull restores the manifest and NEVER deletes the verified cache file", async () => {
  const { root, manifestPath } = makeSandbox();
  const before = readFileSync(manifestPath, "utf8");
  try {
    const rec = goodRecord();
    const r = await intake(null, {
      key: "npc:x", root, destName: "good.glb", studio: studio(rec), driftGate: async () => ({ ok: false }),
    });
    assert.equal(r.ok, false);
    assert.match(r.failures.join(), /drift-gate: failed/);
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    const cached = path.join(root, `game-client/studio-cache/${rec.sha256}.glb`);
    assert.ok(existsSync(cached), "rollback must not rmSync the content-addressed cache file");
    assert.equal(sha(readFileSync(cached)), rec.sha256, "and must not change its bytes");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio dry-run: reads the record and checks the tag, never downloads, writes nothing", async () => {
  const { root, manifestPath } = makeSandbox();
  const before = readFileSync(manifestPath, "utf8");
  const calls = [];
  try {
    const r = await intake(null, {
      key: "npc:x", root, destName: "good.glb", dryRun: true,
      studio: studio(goodRecord(), { fetchImpl: studioDouble(goodRecord(), calls) }),
      driftGate: async () => { throw new Error("dry-run must not run the gate"); },
    });
    assert.equal(r.ok, true, r.failures?.join());
    assert.equal(calls.length, 1, calls.join());
    assert.ok(!calls[0].endsWith("/media"));
    assert.ok(r.actions.some((a) => /^pull \(planned\): a-1 tag t-1 sha256 [0-9a-f]{64}/.test(a)));
    assert.ok(r.actions.some((a) => /^manifest \(planned\): write pull-only entries\["npc:x"\] \(license studio-private\)$/.test(a)));
    assert.equal(readFileSync(manifestPath, "utf8"), before);
    assert.equal(existsSync(path.join(root, "game-client/studio-cache")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("studio: --dest-name is required (the cache file is named by sha256)", async () => {
  const { root } = makeSandbox();
  try {
    const r = await intake(null, { key: "npc:x", root, studio: studio(goodRecord()), driftGate: async () => ({ ok: true }) });
    assert.equal(r.ok, false);
    assert.match(r.failures.join(), /studio: --dest-name is required/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("copy mode keeps its .import reminder and ends with the plain timing line", async () => {
  const { root } = makeSandbox();
  try {
    const { value: r, lines } = await captureLog(() => intake(fx("good.glb"), {
      key: KEY, license: LICENSE, root, driftGate: async () => ({ ok: true }),
    }));
    assert.equal(r.ok, true, r.failures?.join());
    assert.ok(lines.some((l) => /Commit the Godot \.import sidecar/.test(l)));
    assert.match(r.actions.at(-1), /^intake: done in \d+\.\d s$/);
    assert.equal("credits" in r, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rowFromReport: a PASS row gives asset, tag and the batch cost; a missing or failed slug throws naming it", () => {
  assert.deepEqual(rowFromReport(REPORT, "npc-fixture-ok"), {
    assetId: "a-1", tag: "t-1", cost: { batch: "fixture", creditsSpent: 35, creditsEst: 40, genSeconds: 209.4 },
  });
  assert.throws(() => rowFromReport(REPORT, "npc-nope"), /slug npc-nope not in report/);
  assert.throws(() => rowFromReport(REPORT, "npc-fixture-failed"), /slug npc-fixture-failed status FAIL, need PASS/);
});

test("defaultAnimsFor: pipelineCharacter gets the standard pipeline map; other kinds get none", () => {
  const cfg = JSON.parse(readFileSync(new URL("../forge.config.json", import.meta.url), "utf8"));
  const map = defaultAnimsFor("pipelineCharacter", cfg);
  assert.deepEqual(map.attack, ["attack", "attack_2", "attack_3"]);
  assert.equal(map.combat_idle, "block_idle");
  for (const clips of Object.values(map)) for (const c of [clips].flat()) assert.ok(cfg.pipelineClips.includes(c), c);
  assert.equal(cfg.pipelineClips.length, 12);
  assert.equal(defaultAnimsFor("character", cfg), null);
});

test("anims: optional state keys are rejected for character, list values must be non-empty strings", async () => {
  const { root } = makeSandbox();
  try {
    const opt = await intake(fx("good.glb"), {
      key: KEY, license: LICENSE, root, anims: { idle: "idle", block: "block" },
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(opt.ok, false);
    assert.match(opt.failures.join(), /unknown state\(s\) block/);
    const emptyList = await intake(fx("good.glb"), {
      key: KEY, license: LICENSE, root, anims: { attack: [] },
      driftGate: async () => ({ ok: true }),
    });
    assert.equal(emptyList.ok, false);
    assert.match(emptyList.failures.join(), /anims: 'attack' must be a clip name or a non-empty list/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: --from-report without --slug exits 1 with the usage line", () => {
  const r = spawnSync("node", [fileURLToPath(new URL("../intake.mjs", import.meta.url)),
    "--key", "npc:x", "--from-report", REPORT_PATH], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--from-report <report\.json> --slug <slug>/);
});
```

(The suite's top-level imports already bring `readFileSync`, `existsSync`, `rmSync`, `path`, `intake`; the block above adds `fileURLToPath`. ES module imports are hoisted, so appending them mid-file is legal; the builder may move them to the top.)

```js test:scripts/tests/pull-entry.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkNoTrackedCache, checkPullEntry, isPullOnly } from "../lib/pull-entry.mjs";
import { checkLicensePolicy } from "../lib/license-policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BYTES = Buffer.from("pull fixture");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const entry = (over = {}) => ({
  scene: `res://studio-cache/${SHA}.glb`, license: "studio-private", source: "asset studio", kind: "pipelineCharacter",
  pull: { from: "asset-studio", assetStudioAsset: "a-1", tag: "t-1", sha256: SHA }, ...over,
});
function gameClient(content) {
  const gc = mkdtempSync(join(tmpdir(), "pull-entry-"));
  mkdirSync(join(gc, "studio-cache"));
  if (content) writeFileSync(join(gc, "studio-cache", `${SHA}.glb`), content);
  return gc;
}

test("studio-private is allowed only on a pull-only entry (never on a committed asset)", () => {
  const ok = []; checkLicensePolicy("npc:s", entry(), ok);
  assert.deepEqual(ok, []);
  for (const bad of [
    { scene: "res://assets/characters/s.glb", license: "studio-private", source: "x" },
    entry({ scene: "res://assets/characters/s.glb" }),
  ]) {
    const f = []; checkLicensePolicy("npc:s", bad, f);
    assert.match(f.join(), /studio-private is allowed only for pull-only entries/);
  }
});

test("CC0 / CC-BY / other licences are judged exactly as before", () => {
  const f = [];
  checkLicensePolicy("a", { license: "CC0" }, f);
  checkLicensePolicy("b", { license: "GPL" }, f);
  assert.equal(f.length, 1);
  assert.match(f[0], /"GPL" not allowed/);
});

test("isPullOnly needs asset id, tag, a 64-hex sha and the matching cache scene", () => {
  assert.equal(isPullOnly(entry()), true);
  assert.equal(isPullOnly(entry({ pull: { ...entry().pull, sha256: "abc" } })), false);
  assert.equal(isPullOnly(entry({ pull: { ...entry().pull, tag: "" } })), false);
  assert.equal(isPullOnly(entry({ scene: `res://studio-cache/${"0".repeat(64)}.glb` })), false);
  assert.equal(isPullOnly({ scene: "res://assets/a.glb" }), false);
});

test("cache present and matching → ok; tampered cache → failed", () => {
  const f = [];
  assert.equal(checkPullEntry("npc:s", entry(), gameClient(BYTES), f, { skipStudio: false }), "ok");
  assert.deepEqual(f, []);
  const g = [];
  assert.equal(checkPullEntry("npc:s", entry(), gameClient(Buffer.from("tampered")), g, { skipStudio: false }), "failed");
  assert.match(g.join(), /cache file sha256 [0-9a-f]{64} != pull\.sha256/);
});

test("cache empty → loud failure naming the pull command, unless ATLAS_SKIP_STUDIO (CI only)", () => {
  const f = [];
  assert.equal(checkPullEntry("npc:s", entry(), gameClient(null), f, { skipStudio: false }), "failed");
  assert.match(f.join(), /pull-only asset not in cache — run node scripts\/studio-pull\.mjs/);
  const g = [];
  assert.equal(checkPullEntry("npc:s", entry(), gameClient(null), g, { skipStudio: true }), "skipped");
  assert.deepEqual(g, []);
});

test("the real gate: an unpulled entry fails loudly (exit 1); ATLAS_SKIP_STUDIO=1 (CI) turns it into a reported SKIP (exit 0)", () => {
  const m = JSON.parse(readFileSync(join(ROOT, "game-client/assets/manifest.json"), "utf8"));
  const ghost = "e".repeat(64);
  m.entries["npc:ghost_pull"] = entry({ scene: `res://studio-cache/${ghost}.glb`, pull: { ...entry().pull, sha256: ghost } });
  const p = join(mkdtempSync(join(tmpdir(), "pull-gate-")), "manifest.json");
  writeFileSync(p, JSON.stringify(m));
  const run = (env) => spawnSync("node", [join(ROOT, "scripts/check_asset_manifest.mjs"), "--manifest", p],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });
  const loud = run({ ATLAS_SKIP_STUDIO: "" });
  assert.equal(loud.status, 1, loud.stdout);
  assert.match(loud.stdout, /npc:ghost_pull.*pull-only asset not in cache/);
  const skip = run({ ATLAS_SKIP_STUDIO: "1" });
  assert.equal(skip.status, 0, skip.stdout);
  assert.doesNotMatch(skip.stdout, /npc:ghost_pull.*not in cache/);
  assert.match(skip.stdout, /SKIP npc:ghost_pull: pull-only, not in cache \(ATLAS_SKIP_STUDIO=1\)/);
});

test("guard W: nothing under game-client/studio-cache is tracked by git", () => {
  const r = spawnSync("git", ["ls-files", "game-client/studio-cache"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.stdout.trim(), "");
});

test("guard W: a tracked thumbnail row or a tracked Godot file derived from studio-cache fails; the real repo is clean", () => {
  const repo = mkdtempSync(join(tmpdir(), "guard-w-"));
  spawnSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "game-client/assets/.thumbs"), { recursive: true });
  writeFileSync(join(repo, "game-client/assets/.thumbs/index.json"),
    JSON.stringify({ version: 1, entries: { [`res://studio-cache/${SHA}.glb`]: { thumb: "x.webp" }, "classes/a.png": { thumb: "y.webp" } } }));
  writeFileSync(join(repo, "game-client/assets/leak.glb.import"), `source_file="res://studio-cache/${SHA}.glb"\n`);
  assert.equal(spawnSync("git", ["add", "-A"], { cwd: repo }).status, 0);
  const f = [];
  checkNoTrackedCache(repo, f);
  assert.match(f.join("\n"), /\.thumbs\/index\.json records 1 thumbnail\(s\) of pull-only sources/);
  assert.match(f.join("\n"), /1 tracked file\(s\) reference studio-cache bytes: game-client\/assets\/leak\.glb\.import/);
  const clean = [];
  checkNoTrackedCache(ROOT, clean);
  assert.deepEqual(clean, []);
});

test("every new F-174 fixture is committable (git check-ignore exits non-zero for each)", () => {
  for (const p of [
    "scripts/tests/fixtures/studio/sergeant-asset-record.json",
    "scripts/tests/fixtures/studio/pull-manifest.json",
    "atelier/asset-forge/tests/studio-report.fixture.json",
  ]) {
    assert.notEqual(spawnSync("git", ["check-ignore", "-q", p], { cwd: ROOT }).status, 0, `${p} is gitignored: it would never be committed`);
  }
});
```

```js test:scripts/tests/bake-thumbnails-pull.test.mjs
// F-174: a pull-only entry's bytes are private and live in the gitignored studio-cache/.
// bake_thumbnails writes into the TRACKED game-client/assets/.thumbs/, which ships in the
// release image (Dockerfile.atlas-web.dockerignore:9), so it must never queue one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectJobs } from "../bake_thumbnails.mjs";

test("bake_thumbnails never queues a pull-only entry; committed entries are still queued", () => {
  const gc = mkdtempSync(join(tmpdir(), "bake-pull-"));
  const assets = join(gc, "assets");
  mkdirSync(assets, { recursive: true });
  const sha = "7".repeat(64);
  writeFileSync(join(assets, "manifest.json"), JSON.stringify({ entries: {
    "npc:pulled": { scene: `res://studio-cache/${sha}.glb`, kind: "pipelineCharacter",
      pull: { from: "asset-studio", assetStudioAsset: "a-1", tag: "t-1", sha256: sha } },
    "npc:committed": { scene: "res://assets/characters/c.glb", kind: "character" },
  } }));
  writeFileSync(join(assets, "catalog-manifest.json"), JSON.stringify({ entries: {} }));
  const spec = { kindDefaultRender: { character: "model3d", pipelineCharacter: "model3d" }, extRender: { ".glb": "model3d" } };
  const jobs = collectJobs(spec, { assets, gameClient: gc, artRoot: join(assets, "art") });
  assert.deepEqual(jobs.map((j) => j.key), ["npc:committed"]);
  assert.ok(jobs.every((j) => !j.srcPath.includes("studio-cache/")));
});
```

Verify-Cmd: `cd $WT/atelier/asset-forge && node tests/make-fixtures.mjs && node --test tests/intake.test.mjs && cd $WT && node --test scripts/tests/pull-entry.test.mjs scripts/tests/bake-thumbnails-pull.test.mjs`

Expected FAIL: `SyntaxError: The requested module '../intake.mjs' does not provide an export named 'defaultAnimsFor'`, then `ERR_MODULE_NOT_FOUND … scripts/lib/pull-entry.mjs`, then `does not provide an export named 'collectJobs'`. After the `collectJobs` export refactor (Step 2a, no behaviour change) the bake test is red for the right reason: `deepEqual` shows `["npc:pulled", "npc:committed"]`. Only then add the skip.

**Step 2: minimal implementation**

`forge.config.json` (top level, beside `kinds`): the 12 clip names every pipeline character ships, and the default state map built from them:

```json
  "pipelineClips": ["attack", "attack_2", "attack_3", "block", "block_idle", "cast", "death", "hit", "idle", "idle_look", "run", "walk"],
  "pipelineClipMap": {
    "idle": "idle", "walk": "walk", "run": "run", "attack": ["attack", "attack_2", "attack_3"], "death": "death",
    "combat_idle": "block_idle", "block": "block", "hit": "hit"
  },
```

`scripts/lib/pull-entry.mjs`:

```js
// F-174 pull-only manifest entries. The repo is public, so an owner-generated asset is
// recorded by Asset Studio id + tag + sha256 and its bytes live in the gitignored
// game-client/studio-cache/<sha256>.glb. These rules keep a pull-only entry from being judged
// as a committed asset, and keep a committed asset from claiming the studio-private licence.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PULL_SCENE_PREFIX = "res://studio-cache/";
const HEX64 = /^[0-9a-f]{64}$/;
const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";

export function isPullOnly(entry) {
  const p = entry?.pull;
  return Boolean(p && typeof p === "object" && nonEmpty(p.assetStudioAsset) && nonEmpty(p.tag) &&
    HEX64.test(p.sha256 ?? "") && entry.scene === `${PULL_SCENE_PREFIX}${p.sha256}.glb`);
}

export function checkPullEntry(id, entry, gameClient, failures, { skipStudio }) {
  if (!isPullOnly(entry)) {
    failures.push(`entry "${id}": pull block needs assetStudioAsset, tag, 64-hex sha256 and scene ${PULL_SCENE_PREFIX}<sha256>.glb`);
    return "failed";
  }
  const file = join(gameClient, "studio-cache", `${entry.pull.sha256}.glb`);
  if (!existsSync(file)) {
    if (skipStudio) {
      console.log(`SKIP ${id}: pull-only, not in cache (ATLAS_SKIP_STUDIO=1) — not verified`);
      return "skipped";
    }
    failures.push(`entry "${id}": pull-only asset not in cache — run node scripts/studio-pull.mjs (only CI may set ATLAS_SKIP_STUDIO=1; local Gate 1 refuses it)`);
    return "failed";
  }
  const got = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (got !== entry.pull.sha256) {
    failures.push(`entry "${id}": cache file sha256 ${got} != pull.sha256 ${entry.pull.sha256} — delete it and re-run studio-pull`);
    return "failed";
  }
  return "ok";
}

// Guard (W): no byte of a pull-only asset, and nothing derived from one, is tracked. The
// release image copies game-client/assets/** (Dockerfile.atlas-web.dockerignore:9), so a
// tracked thumbnail or .import of the sergeant would publish it.
export function checkNoTrackedCache(repoRoot, failures) {
  const git = (args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  let out;
  try {
    out = git(["ls-files", "game-client/studio-cache"]);
  } catch {
    console.log("W: not a git checkout — tracked-cache check not run");
    return;
  }
  const tracked = out.split("\n").filter(Boolean);
  if (tracked.length) {
    failures.push(`(W) ${tracked.length} file(s) under game-client/studio-cache/ are tracked; this repo is public and pull-only bytes must never be committed: ${tracked.slice(0, 5).join(", ")}`);
  }
  // (W) thumbnail index: tracked, shipped, keyed by source path. No row may come from the cache.
  const idx = join(repoRoot, "game-client/assets/.thumbs/index.json");
  if (existsSync(idx)) {
    const leaked = Object.keys(JSON.parse(readFileSync(idx, "utf8")).entries ?? {}).filter((k) => k.includes("studio-cache/"));
    if (leaked.length) {
      failures.push(`(W) game-client/assets/.thumbs/index.json records ${leaked.length} thumbnail(s) of pull-only sources (${leaked.slice(0, 3).join(", ")}); delete those rows and their .webp files — a private asset's image must never ship`);
    }
  }
  // (W) tracked Godot files derived from the cache bytes (.import sidecar, scene, resource).
  let refs = "";
  try {
    refs = git(["grep", "--cached", "-l", "-F", "res://studio-cache/", "--",
      "game-client/*.import", "game-client/*.tscn", "game-client/*.tres"]);
  } catch (err) {
    if (err.status !== 1) throw err; // git grep exits 1 for "no match"
  }
  const hits = refs.split("\n").filter(Boolean);
  if (hits.length) {
    failures.push(`(W) ${hits.length} tracked file(s) reference studio-cache bytes: ${hits.slice(0, 5).join(", ")} — untrack them (git rm --cached)`);
  }
}
```

`license-policy.mjs`: import `isPullOnly` from `./pull-entry.mjs`. Right after `const lic = raw.trim(); if (lic === "") return;`, add:

```js
  // F-174: an owner-generated Asset Studio asset is not CC0. It is "studio-private" and may only
  // appear on a pull-only entry, whose bytes are never committed to this public repo.
  if (lic === "studio-private") {
    if (!isPullOnly(entry)) {
      failures.push(`entry "${id}": license studio-private is allowed only for pull-only entries (pull{assetStudioAsset, tag, sha256} + scene res://studio-cache/<sha256>.glb)`);
    }
    return;
  }
```

Also extend the header comment by one line: `studio-private` (F-174) is pull-only.

`check_asset_manifest.mjs`:
- Imports: `import { checkPullEntry, checkNoTrackedCache } from "./lib/pull-entry.mjs";`, plus `const SKIP_STUDIO = process.env.ATLAS_SKIP_STUDIO === "1";`.
- (B), at the top of the `else` branch: `const pullState = entry.pull !== undefined ? checkPullEntry(id, entry, gameClient, failures, { skipStudio: SKIP_STUDIO }) : null;`. The existing missing/empty-file failures run only when `pullState === null` (the pull rule owns the cache file). The extension check is unchanged. Task 3's (V) call runs when the file exists, so the clips of a pulled entry are checked in the cache, and a skipped entry has no file, so it is not parsed.
- (U) `assertThumbFreshness`, first line in the loop body: `if (entry && entry.pull !== undefined) continue; // F-174 pull-only: no tracked thumbnail of a private asset in a public repo`.
- New guard (W) once per run, after the per-entry loop: `checkNoTrackedCache(repoRoot, failures)` (use the script's existing repo-root constant).
- Header comment: add (W) (nothing tracked under the cache, no `.thumbs/index.json` row from it, no tracked `.import`/`.tscn`/`.tres` naming `res://studio-cache/`), and the note "(B) for a pull-only entry checks the cache file's sha256; an empty cache fails unless ATLAS_SKIP_STUDIO=1 (set by CI only; local Gate 1 refuses it), which prints SKIP".

`.github/workflows/ci.yml`, the manifest-gate step (lines 69-70) becomes (R1 CI config; atlas promotes direct, but the workflow still runs on push). The `::warning::` line makes the skip visible on the run summary; Task 8's test pins it:

```yaml
      # F-174: CI cannot reach the local Asset Studio, so pull-only entries are SKIPPED here, loudly.
      # Local Gate 1 refuses ATLAS_SKIP_STUDIO (scripts/precheck.sh pipeline_char_section).
      - name: Asset manifest drift-gate (keys ↔ manifest ↔ files ↔ license)
        env:
          ATLAS_SKIP_STUDIO: "1"
        run: |
          echo "::warning title=F-174 pull-only checks skipped::ATLAS_SKIP_STUDIO=1 in CI: pull-only entries (the sergeant) are NOT verified here; local Gate 1 verifies them against Asset Studio."
          node scripts/check_asset_manifest.mjs
```

`scripts/bake_thumbnails.mjs` (Step 2a, refactor first, no behaviour change; then the skip):
- `collectJobs(spec)` → `export function collectJobs(spec, { assets = ASSETS, gameClient = GAME_CLIENT, artRoot = ART_ROOT } = {})`, and inside it use `assets`, `gameClient`, `artRoot` in place of the three constants (lines 113, 120, 130 and 139).
- The module-level `main().then(...)` (lines 377-383) runs only when executed directly: wrap it in `if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { … }` (`fileURLToPath` and `resolve` are already imported). The test imports the module, and it must not start a bake.
- Run the bake test now: red with `["npc:pulled", "npc:committed"]`. Then, in the manifest loop right after `if (!srcPath) continue;`:

```js
      // F-174: a pull-only entry's bytes are private (gitignored studio-cache/). Its thumbnail
      // would land in the TRACKED .thumbs/ and ship in the release image. Guard (W) backs this up.
      if (entry.pull) continue;
```

`atelier/asset-forge/intake.mjs`, the **whole file** after this task (it replaces the current 313 lines; copy mode behaves as before apart from the widened anims check, the staged validation and the timing line):

```js
#!/usr/bin/env node
// Transactional intake: takes a baked, validated .glb and lands it in the
// game-client manifest as a single atomic operation.
//
// Two modes:
//   copy mode   <glb> --key <k> --license "<text>"
//               copies the glb into game-client/assets/characters/ (unchanged behaviour).
//   studio mode (F-174) --from-report <report.json> --slug <slug> | --studio-asset <id> --tag <tag>
//               fetches the Asset Studio record, requires the tag, pulls the bytes (sha256 from the
//               RECORD, never from the local file) into the gitignored game-client/studio-cache/,
//               validates a staged copy named --dest-name, and writes a PULL-ONLY entry with
//               license "studio-private". Nothing is copied into game-client/assets/ and no byte
//               of the asset is ever tracked: this repo is public.
//
// Order of operations:
//   0. kind + anims checks (anims default: forge.config.json pipelineClipMap for pipelineCharacter);
//      studio mode: record fetch + tag check, then the sha256-verified pull.
//   1. validate a staged copy named <dest-name> (so the naming and ledger rules see the shipped
//      name, never "out" or "<sha>") -- any failure aborts with zero side effects.
//   2. read + parse the manifest -- a missing/malformed manifest aborts, still with no writes.
//   3. copy mode: copy the glb; studio mode: nothing to copy. 3b. normalize: copy mode rewrites
//      crushing tracks in place; studio mode checks IN MEMORY and fails rather than change
//      approved bytes. Then write the entry atomically.
//   4. run the drift-gate (`node <root>/scripts/check_asset_manifest.mjs`, injectable).
//   5. on ANY failure after step 2, roll back the manifest to its exact pre-write bytes. Copy
//      mode also restores/deletes the copied glb. Studio mode NEVER deletes the cache file: it is
//      content-addressed, sha-verified, gitignored, and the next run reuses it.
//
// Every result carries `seconds`; the last action is the timing line, which in studio mode also
// carries the batch's Tripo credits (credits_spent / credits_est): the goal's "faster" and
// "lower cost" numbers.
//
// Exit 0 on success, 1 on any failure. `--dry-run` writes nothing: copy mode validates and
// reports; studio mode reads the record and checks the tag, and never downloads the media.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { validateGlb, loadConfig, stateKeysForKind } from "./validate.mjs";
import { normalizeRigidTranslations } from "./lib/normalize-anim.mjs";
import {
  repoRoot,
  writeManifestAtomic,
  writeManifestRaw,
} from "./lib/manifest.mjs";
import { pullAsset, fetchAssetRecord } from "../../scripts/lib/studio-pull.mjs";
import { studioToken } from "../../scripts/lib/studio-token.mjs";

const REMINDER = "Commit the Godot .import sidecar together with the glb";
const CACHE_REL = "game-client/studio-cache";
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Default drift-gate runner: spawns
 * `node scripts/check_asset_manifest.mjs` with cwd=root.
 * @param {{root: string}} ctx
 * @returns {Promise<{ok: boolean}>}
 */
function defaultDriftGateRunner({ root }) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/check_asset_manifest.mjs"], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("error", () => resolve({ ok: false }));
    child.on("exit", (code) => resolve({ ok: code === 0 }));
  });
}

/** {assetId, tag, cost} for a PASS row of an atlas-char batch report (batches/<name>/report.json). */
export function rowFromReport(report, slug) {
  const row = (report?.characters ?? []).find((c) => c.slug === slug);
  if (!row) throw new Error(`slug ${slug} not in report`);
  if (row.status !== "PASS") throw new Error(`slug ${slug} status ${row.status}, need PASS`);
  const num = (v) => (typeof v === "number" ? v : null);
  return {
    assetId: row.asset,
    tag: row.tag,
    // Credits are recorded per batch (atlas_char/batch.py:147), not per row.
    cost: {
      batch: report.name ?? "?",
      creditsSpent: num(report.credits_spent),
      creditsEst: num(report.credits_est),
      genSeconds: num(row.seconds),
    },
  };
}

/** The default anims for a kind: the standard pipeline clip map for pipelineCharacter. */
export function defaultAnimsFor(kind, config) {
  return kind === "pipelineCharacter" ? structuredClone(config.pipelineClipMap) : null;
}

function costText(cost) {
  if (!cost) return "credits n/a (no batch report)";
  const n = (v) => (v === null ? "?" : String(v));
  const gen = cost.genSeconds === null ? "" : ` · gen ${cost.genSeconds.toFixed(1)} s`;
  return `credits spent ${n(cost.creditsSpent)} / est ${n(cost.creditsEst)} (batch ${cost.batch} total)${gen}`;
}

function checkAnims(anims, kindConfig) {
  if (anims == null) return null;
  if (typeof anims !== "object" || Array.isArray(anims)) {
    return "anims: must be a JSON object mapping state to clip name";
  }
  const allowed = stateKeysForKind(kindConfig);
  const unknown = Object.keys(anims).filter((state) => !allowed.includes(state));
  if (unknown.length > 0) {
    return `anims: unknown state(s) ${unknown.join(", ")} (expected one of: ${allowed.join(", ")})`;
  }
  for (const [state, v] of Object.entries(anims)) {
    const okValue = (typeof v === "string" && v !== "") ||
      (Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "string" && c !== ""));
    if (!okValue) return `anims: '${state}' must be a clip name or a non-empty list of clip names`;
  }
  return null;
}

/**
 * Transactional intake of a baked .glb (copy mode) or an Asset Studio asset (studio mode).
 * @param {string|null} glbPath  ignored in studio mode
 * @param {{key: string, license?: string, root: string, kind?: string, dryRun?: boolean,
 *   anims?: object|null, driftGate?: Function, destName?: string|null,
 *   studio?: {assetId: string, tag: string, token?: string, fetchImpl?: Function, baseUrl?: string,
 *             cost?: {batch: string, creditsSpent: number|null, creditsEst: number|null, genSeconds: number|null}|null}|null}} opts
 * @returns {Promise<{ok: boolean, actions: string[], failures?: string[], seconds: number,
 *   credits?: {spent: number|null, est: number|null}|null}>}
 */
export async function intake(glbPath, opts = {}) {
  const t0 = performance.now();
  const {
    key, license, root, kind = "character", dryRun = false, driftGate,
    destName = null, studio = null,
  } = opts;
  if (!key) throw new Error("intake: 'key' is required");
  if (!root) throw new Error("intake: 'root' is required");

  const actions = [];
  // Every return goes through done(): the timing line is always the last action.
  const done = (result) => {
    const seconds = (performance.now() - t0) / 1000;
    actions.push(`intake: done in ${seconds.toFixed(1)} s${studio ? ` · ${costText(studio.cost ?? null)}` : ""}`);
    const out = { ...result, actions, seconds };
    if (studio) {
      out.credits = studio.cost ? { spent: studio.cost.creditsSpent, est: studio.cost.creditsEst } : null;
    }
    return out;
  };

  const manifestPath = path.join(root, "game-client/assets/manifest.json");
  const charactersDir = path.join(root, "game-client/assets/characters");
  const licenseLedgerPath = path.join(root, "art-source/LICENSES.md");

  const config = loadConfig();
  const kinds = config.kinds;
  if (!Object.hasOwn(kinds, kind)) {
    return done({
      ok: false,
      failures: [`kind: unknown kind "${kind}" (expected one of: ${Object.keys(kinds).join(", ")})`],
    });
  }
  const anims = opts.anims ?? defaultAnimsFor(kind, config);

  if (studio && !destName) {
    return done({ ok: false, failures: ["studio: --dest-name is required (the cache file is named by sha256)"] });
  }
  if (!studio && !glbPath) {
    return done({ ok: false, failures: ["intake: a glb path is required outside studio mode"] });
  }
  const basename = destName ?? path.basename(glbPath);
  const name = basename.replace(/\.glb$/i, "");

  // 0. anims -- an unknown state key or a bad value aborts with zero side effects.
  const animsFailure = checkAnims(anims, kinds[kind]);
  if (animsFailure) return done({ ok: false, failures: [animsFailure] });

  // 0b. Studio mode: provenance from the Asset Studio API record of the approved asset. Never
  //     from sheet.json, never by hashing the local file (that compares the file with itself).
  let srcPath = glbPath;
  let pull = null;
  let gen = null;
  if (studio) {
    let rec;
    try {
      rec = await fetchAssetRecord(studio.assetId, studio);
    } catch (err) {
      // fetchAssetRecord words a 401/403 as "studio auth failed (http …)".
      return done({ ok: false, failures: [err.auth ? err.message : `studio: ${err.message}`] });
    }
    const tags = rec.tags ?? [];
    if (!tags.includes(studio.tag)) {
      return done({ ok: false, failures: [`studio: tag ${studio.tag} not in asset ${studio.assetId} tags (${tags.join(", ")})`] });
    }
    if (!HEX64.test(rec.sha256 ?? "")) {
      return done({ ok: false, failures: [`studio: asset ${studio.assetId} record has no 64-hex sha256`] });
    }
    pull = { from: "asset-studio", assetStudioAsset: studio.assetId, tag: studio.tag, sha256: rec.sha256 };
    gen = {
      ...(tags.includes("tripo") ? { model: "tripo", provider: "tripo" } : {}),
      ...(tags.includes("mixamo") ? { rig: "mixamo", clips: "mixamo" } : {}),
    };
    const cacheDir = path.join(root, CACHE_REL);
    if (dryRun) {
      // Read-only: the record was fetched, the media is not, and nothing is written.
      actions.push(`pull (planned): ${studio.assetId} tag ${studio.tag} sha256 ${rec.sha256} -> ${path.join(cacheDir, `${rec.sha256}.glb`)}`);
      actions.push(`manifest (planned): write pull-only entries["${key}"] (license studio-private)`);
      actions.push("drift-gate (planned): run");
      return done({ ok: true });
    }
    const r = await pullAsset({
      assetId: studio.assetId, sha256: rec.sha256, cacheDir, token: studio.token,
      fetchImpl: studio.fetchImpl, baseUrl: studio.baseUrl, record: rec,
    });
    if (!r.ok) return done({ ok: false, failures: [r.failure] });
    actions.push(`pull: ${studio.assetId} tag ${studio.tag} sha256 ${rec.sha256} -> ${r.path}${r.cached ? " (cached)" : ""}`);
    srcPath = r.path;
  }
  const scene = pull ? `res://studio-cache/${pull.sha256}.glb` : `res://assets/characters/${name}.glb`;
  const destPath = pull ? srcPath : path.join(charactersDir, basename);

  // 1. Validate a staged copy named `basename`, so the naming rule and the ledger rule see the
  //    shipped name. A `<sha>.glb` cache name must never reach the ledger substring check.
  let validatePath = srcPath;
  let stageDir = null;
  let validation;
  try {
    if (basename !== path.basename(srcPath)) {
      stageDir = mkdtempSync(path.join(tmpdir(), "atlas-intake-"));
      validatePath = path.join(stageDir, basename);
      copyFileSync(srcPath, validatePath);
    }
    validation = await validateGlb(validatePath, {
      kind,
      tier: "bespoke",
      anims,
      licenseLedger: existsSync(licenseLedgerPath) ? licenseLedgerPath : undefined,
    });
  } finally {
    if (stageDir) rmSync(stageDir, { recursive: true, force: true });
  }
  if (validation.failures.length > 0) {
    return done({ ok: false, failures: validation.failures });
  }
  actions.push(`validate: ${srcPath}${validatePath !== srcPath ? ` (as ${basename})` : ""} OK`);
  for (const w of validation.warnings ?? []) actions.push(`warn: ${w}`);

  if (dryRun) {
    actions.push(`copy (planned): ${srcPath} -> ${destPath}`);
    actions.push(`manifest (planned): write entries["${key}"]`);
    actions.push("drift-gate (planned): run");
    return done({ ok: true });
  }

  // 2. Read + parse the manifest BEFORE touching the filesystem.
  let backupText;
  let manifest;
  try {
    backupText = readFileSync(manifestPath, "utf8");
    manifest = JSON.parse(backupText);
  } catch (err) {
    return done({ ok: false, failures: [`manifest read: ${err.message}`] });
  }
  manifest.entries ??= {};
  manifest.entries[key] = {
    scene,
    source: pull ? `Asset Studio library asset ${pull.assetStudioAsset} (client atlas-world); bytes not in this repo` : "internal",
    license: pull ? "studio-private" : license,
    tier: "bespoke",
    kind,
    ...(pull ? { pull } : {}),
    ...(gen && Object.keys(gen).length ? { gen } : {}),
    ...(anims ? { anims } : {}),
  };

  // Copy mode: snapshot any glb already at destPath so rollback restores it byte-for-byte.
  const destExisted = !pull && existsSync(destPath);
  const destBackup = destExisted ? readFileSync(destPath) : null;

  function rollback() {
    writeManifestRaw(manifestPath, backupText);
    // Studio mode: NEVER rmSync the cache file. It is content-addressed and sha-verified,
    // gitignored, outside the tracked tree, and the next run reuses it.
    if (pull) return;
    if (destExisted) writeFileSync(destPath, destBackup);
    else rmSync(destPath, { force: true });
  }

  // 3. Copy mode only: copy the glb into the game-client asset tree.
  if (!pull) {
    mkdirSync(charactersDir, { recursive: true });
    copyFileSync(srcPath, destPath);
    actions.push(`copy: ${srcPath} -> ${destPath}`);
  }

  // 3b. Normalize rigid-skeleton animations (see lib/normalize-anim.mjs). Copy mode rewrites the
  //     copied glb in place. Studio mode runs IN MEMORY only: rewriting the cache file would
  //     break its sha256, so a pull-only asset that needs normalizing is refused.
  try {
    const io = new NodeIO().setStrictResources(false);
    const doc = await io.read(destPath);
    const rep = normalizeRigidTranslations(doc);
    if (rep.removedChannels > 0) {
      if (pull) {
        rollback();
        return done({
          ok: false,
          failures: [`normalize: pull-only asset needs ${rep.removedChannels} channel(s) normalized — fix it in the pipeline; intake must not change approved bytes`],
        });
      }
      await io.write(destPath, doc);
      actions.push(
        `normalize: pinned ${rep.pinnedBones.length} crushing bones ` +
          `(${rep.removedChannels} channels) to rest`,
      );
    }
  } catch (err) {
    rollback();
    return done({ ok: false, failures: [`normalize: ${err.message}`] });
  }

  try {
    writeManifestAtomic(manifestPath, manifest);
  } catch (err) {
    rollback();
    return done({ ok: false, failures: [`manifest write: ${err.message}`] });
  }
  actions.push(`manifest: wrote entries["${key}"]${pull ? " (pull-only)" : ""}`);

  // 4. Drift-gate. No thumbnail bake: bake_thumbnails and guard (U) both skip pull entries.
  const gate = driftGate ?? defaultDriftGateRunner;
  let gateResult;
  try {
    gateResult = await gate({ root, key });
  } catch (err) {
    gateResult = { ok: false, error: err.message };
  }
  if (!gateResult || !gateResult.ok) {
    rollback();
    return done({ ok: false, failures: ["drift-gate: failed"] });
  }
  actions.push("drift-gate: passed");

  // The .import reminder is for committed glbs. A pull-only asset commits nothing.
  if (!pull) console.log(REMINDER);
  return done({ ok: true });
}

/**
 * Minimal argv parser. Supports `--flag value`, `--flag=value` (so a value
 * may itself begin with `--`, e.g. license text), and the boolean
 * `--dry-run`. Exported for testing.
 * @param {string[]} argv
 * @returns {{positional: string[], flags: Record<string, string | true>}}
 */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      flags["dry-run"] = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for --${body}`);
      }
      flags[body] = value;
      i++;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function printUsageAndExit() {
  console.error(
    'usage: node intake.mjs <glb> --key <manifest-key> --license "<text>" ' +
      "[--dry-run] [--anims '<json>'] [--kind <kind>] [--dest-name <file.glb>]\n" +
      "     | node intake.mjs (--from-report <report.json> --slug <slug> | --studio-asset <id> --tag <tag>) " +
      "--key <k> --kind pipelineCharacter --dest-name <file.glb> [--dry-run] [--anims '<json>']",
  );
  process.exit(1);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [glbPath] = positional;

  let studio = null;
  if (flags["from-report"]) {
    if (!flags.slug) printUsageAndExit();
    studio = rowFromReport(JSON.parse(readFileSync(path.resolve(flags["from-report"]), "utf8")), flags.slug);
  } else if (flags["studio-asset"]) {
    if (!flags.tag) printUsageAndExit();
    studio = { assetId: flags["studio-asset"], tag: flags.tag, cost: null };
  }
  if (!flags.key || (!studio && (!glbPath || !flags.license))) printUsageAndExit();
  if (studio) {
    studio.token = studioToken(); // scripts/lib/studio-token.mjs; never printed
    if (!studio.token) {
      console.log("FAIL studio: no Asset Studio token (set STUDIO_TOKEN, or start the orbstack asset-studio namespace)");
      process.exit(1);
    }
  }

  const result = await intake(studio ? null : path.resolve(glbPath), {
    key: flags.key,
    license: flags.license,
    root: repoRoot(),
    dryRun: Boolean(flags["dry-run"]),
    kind: flags.kind,
    anims: flags.anims ? JSON.parse(flags.anims) : null,
    destName: flags["dest-name"] || null,
    studio,
  });

  for (const action of result.actions) console.log(action);
  for (const failure of result.failures ?? []) console.log(`FAIL ${failure}`);
  process.exit(result.ok ? 0 : 1);
}

// Only run the CLI when this file is executed directly -- not when
// `intake` is imported as a module by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`intake.mjs: ERROR: ${err.message}`);
    process.exit(1);
  });
}
```

Notes on the file above:
- `loadConfig()` is called once, and the full config feeds both `kinds` and `defaultAnimsFor` (`pipelineClipMap` sits at the top level of `forge.config.json`, which `loadConfig` spreads through as `...raw`).
- `kind` passed as `undefined` from the CLI falls back to the destructure default `"character"`, as today.
- `printUsageAndExit` is reached before `studioToken()`, so a usage error never touches kubectl.
- In studio mode `--license` is not read: the licence is always `studio-private`.

**Step 3: run → PASS** (same Verify-Cmd, then `npm test` for the asset-forge suite). Run `node --test atelier/atlas-world-panels/tests/*.test.mjs` too. If a panels test demands a thumbnail or a file for every manifest entry, exempt `pull` entries there with the same `isPullOnly` import. The rule is "pull-only = no tracked bytes". Never commit a thumbnail to satisfy that test.

**Step 4: real intake of the sergeant, driven from the batch report row** (no hand-written JSON):

1. Register the kind: add `"pipelineCharacter"` to the `character` section's `kinds` in `content/asset-taxonomy.json`, and `"pipelineCharacter": "model3d"` to `kindDefaultRender` in `game-client/assets/render-spec.json`. Then `node --test atelier/atlas-world-panels/tests/taxonomy.test.mjs atelier/atlas-world-panels/tests/assets-kinds.test.mjs` → PASS.
2. Ledger row in `art-source/LICENSES.md` (same table as row 17). It is honest, never CC0:
   `| \`studio-cache/lantern_hollow_watch_sergeant.glb\` (pull-only, not in repo) | studio | Asset Studio asset 01a1a97a-8e45-71d6-885f-459aa1cebf7f, tag p4b-11050912 (Tripo mesh + Mixamo rig/clips); owner-generated, private | studio-private | owner | 2026-11-06 | pull-only — \`npc:lantern_hollow_watch_sergeant\`, bytes fetched by sha256 7f1c54c3… (F-174) |`
   The validate ledger check looks for `lantern_hollow_watch_sergeant` (the `--dest-name` stem), so this row satisfies it.
3. Run it and time it:

```bash
cd $WT && node atelier/asset-forge/intake.mjs \
  --from-report ~/asset-studio-private/atlas-3d-plan/batches/p5-existing/report.json \
  --slug npc-lantern-hollow-watch-sergeant \
  --key npc:lantern_hollow_watch_sergeant --kind pipelineCharacter \
  --dest-name lantern_hollow_watch_sergeant.glb
```

   Expected: `pull: 01a1a97a… tag p4b-11050912 sha256 7f1c54c3… -> …/game-client/studio-cache/7f1c….glb (cached)`, `validate: … (as lantern_hollow_watch_sergeant.glb) OK`, no `normalize:` failure, `manifest: wrote entries["npc:lantern_hollow_watch_sergeant"] (pull-only)`, `drift-gate: passed`, no `Commit the Godot .import sidecar` line, and last `intake: done in N.N s · credits spent 0 / est 0 (batch p5-existing total) · gen 209.4 s`, exit 0. **Record the wall time and the credits** in the task report and in the ship report: they are the "faster" and "lower cost" numbers for the goal (p5-existing re-used an existing asset, so 0 credits is the honest figure; a fresh batch reports its real spend). (The p5-existing row was verified on 2026-11-06: `status PASS`, `asset 01a1a97a…`, `tag p4b-11050912`.)
4. Godot import: `"$GODOT" --headless --path $WT/game-client --import`. The cache's `7f1c….glb.import` exists, and `git status --porcelain` lists no file under `game-client/studio-cache/` and no file under `game-client/assets/characters/`.
5. `git diff --stat` shows only manifest.json, asset-taxonomy.json, render-spec.json, LICENSES.md and the code/test files. `git ls-files game-client/studio-cache` prints nothing.

**Step 5: README.** `atelier/asset-forge/README.md` §"Stage: INTAKE": document studio mode (`--from-report/--slug`, `--studio-asset/--tag`), that the sha256 comes from the Asset Studio record, that the bytes go to the gitignored cache, `studio-private`, `pipelineClipMap`, `--dest-name`, the widened `anims`, the studio `--dry-run` (record + tag only, no download), and the `intake: done in … · credits …` line (wall time plus the batch's Tripo credits). Add the exact sergeant command to §"Command block".

**Step 6: commit** two commits: `feat(asset-forge): studio pull-only intake from a batch report row (F-174)` (code, tests, `studio-report.fixture.json`, policy, gate, `bake_thumbnails.mjs`, ci.yml; `git status --porcelain atelier/asset-forge/tests/` must list the fixture as added, proving it is not ignored), then `feat(assets): pull-only entry npc:lantern_hollow_watch_sergeant (F-174)` (manifest, taxonomy, render-spec, ledger). Neither commit contains a glb, a `.import` or an image of the sergeant.

**Phase gate:** `node scripts/check_asset_manifest.mjs` → `0 failure(s)` with the cache filled (the empty-cache and SKIP paths are proven by `pull-entry.test.mjs`); asset-forge `npm test` green; `git ls-files | grep -c studio-cache` → `0`; `node scripts/bake_thumbnails.mjs --dry-run --skip-3d | grep -c studio-cache` → `0` (the real manifest now holds the pull entry, and the baker must not queue it); `node -e 'const i=require("./game-client/assets/.thumbs/index.json");console.log(Object.keys(i.entries).filter(k=>k.includes("studio-cache/")).length)'` → `0`.
---

## Task 3: Manifest gate: mapped clips exist; combat entries are complete

**Files:**
- Create: `scripts/lib/anim-clips.mjs`, `scripts/tests/anim-clips.test.mjs`
- Modify: `scripts/check_asset_manifest.mjs`: import block (lines 89-98), `validateEntry` after the (B) file-exists check (around lines 455-460), header comment (add guard **(V)**)

**Interfaces:**
- Produces: `glbClipNames(fsPath: string): string[]` (throws on non-GLB); `checkAnimClips(id: string, entry: object, fsPath: string, failures: string[]): void`; `COMBAT_REQUIRES = ["idle","walk","run","attack","death"]`.

**Step 1: failing test**

```js test:scripts/tests/anim-clips.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { glbClipNames, checkAnimClips } from "../lib/anim-clips.mjs";

// Minimal GLB: 12-byte header + one JSON chunk (padded to 4 bytes).
function glb(json) {
  let body = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (body.length % 4)) % 4;
  body = Buffer.concat([body, Buffer.alloc(pad, 0x20)]);
  const h = Buffer.alloc(20);
  h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(20 + body.length, 8);
  h.writeUInt32LE(body.length, 12); h.writeUInt32LE(0x4e4f534a, 16);
  const p = join(mkdtempSync(join(tmpdir(), "animclips-")), "m.glb");
  writeFileSync(p, Buffer.concat([h, body]));
  return p;
}
const CLIPS = ["idle", "walk", "run", "attack", "attack_2", "death", "block_idle", "hit"];
const file = () => glb({ asset: { version: "2.0" }, animations: CLIPS.map((name) => ({ name })) });
const full = { idle: "idle", walk: "walk", run: "run", attack: ["attack", "attack_2"], death: "death", combat_idle: "block_idle", hit: "hit" };

test("glbClipNames reads the JSON chunk", () => {
  assert.deepEqual(glbClipNames(file()), CLIPS);
});

test("all mapped clips present (string and list) → no failure", () => {
  const f = []; checkAnimClips("npc:s", { anims: full }, file(), f);
  assert.deepEqual(f, []);
});

test("a renamed mapped clip fails, naming state and clip", () => {
  const f = []; checkAnimClips("npc:s", { anims: { ...full, hit: "hit_RENAMED" } }, file(), f);
  assert.match(f.join(), /anims\.hit → clip "hit_RENAMED" not in/);
});

test("a renamed attack variant fails", () => {
  const f = []; checkAnimClips("npc:s", { anims: { ...full, attack: ["attack", "attack_9"] } }, file(), f);
  assert.match(f.join(), /anims\.attack → clip "attack_9"/);
});

test("combat_idle without death fails completeness", () => {
  const { death, ...noDeath } = full;
  const f = []; checkAnimClips("npc:s", { anims: noDeath }, file(), f);
  assert.match(f.join(), /maps combat_idle but not death/);
});

test("an entry without combat_idle needs no combat set; no anims → no-op", () => {
  const f = [];
  checkAnimClips("mob:a", { anims: { idle: "idle" } }, file(), f);
  checkAnimClips("mob:b", {}, file(), f);
  assert.deepEqual(f, []);
});

test("an LFS pointer or non-GLB fails loudly instead of passing", () => {
  const p = join(mkdtempSync(join(tmpdir(), "animclips-")), "p.glb");
  writeFileSync(p, "version https://git-lfs.github.com/spec/v1\n");
  const f = []; checkAnimClips("npc:s", { anims: { idle: "idle" } }, p, f);
  assert.match(f.join(), /cannot read clips — not a binary glTF/);
});

test("an empty list or non-string clip fails", () => {
  const f = []; checkAnimClips("npc:s", { anims: { ...full, hit: [] } }, file(), f);
  assert.match(f.join(), /anims\.hit must be a clip name or a non-empty list/);
});
```

Verify-Cmd: `cd $WT && node --test scripts/tests/anim-clips.test.mjs`

Expected FAIL: `ERR_MODULE_NOT_FOUND … scripts/lib/anim-clips.mjs`.

**Step 2: minimal implementation** `scripts/lib/anim-clips.mjs`:

```js
// Guard (V) of check_asset_manifest.mjs (F-174): every manifest `anims` value
// names a clip that exists in its glb, and an entry that maps `combat_idle`
// maps the whole base set. Clip-name drift between the asset pipeline and the
// client is the main future failure; without this, a renamed clip ships green
// and the client silently skips the state (AnimationController warns once).
import { readFileSync } from "node:fs";

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"
export const COMBAT_REQUIRES = ["idle", "walk", "run", "attack", "death"];

/** Animation names from a binary glTF's JSON chunk. Throws on anything else. */
export function glbClipNames(fsPath) {
  const b = readFileSync(fsPath);
  if (b.length < 20 || b.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("not a binary glTF (Git LFS pointer? run git lfs pull)");
  }
  if (b.readUInt32LE(16) !== JSON_CHUNK) throw new Error("first GLB chunk is not JSON");
  const len = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + len).toString("utf8"));
  return (json.animations ?? []).map((a) => a.name ?? "");
}

export function checkAnimClips(id, entry, fsPath, failures) {
  const anims = entry?.anims;
  if (anims == null) return;
  if (typeof anims !== "object" || Array.isArray(anims)) {
    failures.push(`entry "${id}": anims must be an object`);
    return;
  }
  if (anims.combat_idle != null) {
    const missing = COMBAT_REQUIRES.filter((s) => anims[s] == null);
    if (missing.length) failures.push(`entry "${id}": maps combat_idle but not ${missing.join(", ")}`);
  }
  if (!fsPath.toLowerCase().endsWith(".glb")) return; // .gltf/.tscn are not parsed here
  let names;
  try {
    names = new Set(glbClipNames(fsPath));
  } catch (err) {
    failures.push(`entry "${id}": cannot read clips — ${err.message}`);
    return;
  }
  for (const [state, value] of Object.entries(anims)) {
    const list = Array.isArray(value) ? value : [value];
    if (list.length === 0 || list.some((c) => typeof c !== "string" || c === "")) {
      failures.push(`entry "${id}": anims.${state} must be a clip name or a non-empty list of clip names`);
      continue;
    }
    for (const clip of list) {
      if (!names.has(clip)) {
        failures.push(`entry "${id}": anims.${state} → clip "${clip}" not in ${[...names].join(", ") || "(no clips)"}`);
      }
    }
  }
}
```

`check_asset_manifest.mjs`: `import { checkAnimClips } from "./lib/anim-clips.mjs";` and inside `validateEntry`'s `else` branch of (B), after the empty-file check:

```js
    if (existsSync(fsPath) && statSync(fsPath).isFile() && statSync(fsPath).size > 0) {
      checkAnimClips(id, entry, fsPath, failures); // (V) F-174
    }
```

**Step 3: run → PASS**, then `node scripts/check_asset_manifest.mjs` → `0 failure(s)` (the 8 existing anims entries plus the pulled sergeant, whose clips are read from `game-client/studio-cache/`; with `ATLAS_SKIP_STUDIO=1` and a cold cache the sergeant prints `SKIP` instead).

**Step 4: proven red on the real manifest** (spec criterion "proven red when a mapped clip is renamed and when the death mapping is removed"):

```bash
cd $WT && T=$(mktemp -d) && for mut in rename nodeath; do
  node -e '
    const fs=require("fs"); const m=JSON.parse(fs.readFileSync("game-client/assets/manifest.json"));
    const a=m.entries["npc:lantern_hollow_watch_sergeant"].anims;
    if (process.argv[1]==="rename") a.hit="hit_RENAMED"; else delete a.death;
    fs.writeFileSync(process.argv[2], JSON.stringify(m));' "$mut" "$T/$mut.json"
  node scripts/check_asset_manifest.mjs --manifest "$T/$mut.json" > "$T/$mut.out" 2>&1; rc=$?
  grep -E 'FAIL.*(hit_RENAMED|not death)' "$T/$mut.out"; echo "$mut exit=$rc"
done
```

Expected: one FAIL line each and `rename exit=1`, `nodeath exit=1`. The real manifest is never edited. (The exit code is captured before the grep, so this works the same in zsh and bash. Rev 1 used zsh-only `${pipestatus[1]}`.)

**Step 5: README.** Add guard (V) to the header comment of `scripts/check_asset_manifest.mjs`, and one line under §"Stage: INTAKE" in `atelier/asset-forge/README.md`: the drift-gate now checks clip names.

**Step 6: commit** `feat(gate): manifest anims must name real clips; combat entries complete (F-174)`.

**Phase gate (end of Wave A):** asset-forge `npm test`, `node --test scripts/tests/anim-clips.test.mjs`, and `node scripts/check_asset_manifest.mjs` are all green. Wave A review: `code-reviewer` + `typescript-reviewer` over Tasks 1-3.

---

## Task 4: Manifest list anims in C#, the probe runner, and the probe skeleton

**Files:**
- Modify: `game-client/src/Content/AssetManifest.cs`: `AssetEntry` (after line 41), parse locals (line 187), anims branch (lines 218-226), entry init (lines 231-239)
- Modify: `game-client/src/Content/AssetRegistry.cs` (after line 109)
- Create: `game-client/src/World/PipelineCharVerify.cs`, `scripts/godot-verify.sh`, `scripts/tests/godot-verify.test.mjs`
- Modify: `game-client/src/VerticalSliceRoot.cs` (after line 164). `GameRoot.cs` is **not** touched, because its scene never runs (Facts #2).
- Modify: `scripts/system-deps.json` (`dotnet`, `godot-mono`, both `required: false` with a note, per its `_comment` rule: "add an entry BEFORE adding a new … spawn … call")

**Interfaces:**
- Produces: `AssetEntry.AnimVariants : IReadOnlyDictionary<string, IReadOnlyList<string>>` (never null; `Anims[k]` = first variant, so existing callers are unchanged); `AssetRegistry.ResolveAnimVariants(string typeId) : IReadOnlyDictionary<string, IReadOnlyList<string>>`; `PipelineCharVerify : Node` (const `Key = "npc:lantern_hollow_watch_sergeant"`, `MobKey = "mob:aggressive"`); `scripts/godot-verify.sh <ENV_NAME> <PASS_REGEX>`, which exits 0 only on probe exit 0 **and** a matching line. Every probe call is wrapped in `timeout ${ATLAS_GODOT_TIMEOUT:-180}`; the `--import` call has its own bound, `${ATLAS_GODOT_IMPORT_TIMEOUT:-900}` (a fresh worktree imports ~633 glbs, which can exceed 180 s). A timeout is a failure either way. It runs `--headless --import` first when `<project>/.godot/imported` is missing or any `studio-cache/*.glb` lacks its `.import`. Env `ATLAS_GODOT_PROJECT` overrides the project dir, for tests.

**Step 1: failing tests**

```js test:scripts/tests/godot-verify.test.mjs
// godot-verify.sh must never accept an exit code alone (PATH godot exits 0 on C# failure),
// must never hang, and must import a fresh project before probing it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MONO = "4.7.2.stable.mono.official.ed1daf0bf";
// A stub godot: --version prints `version`; --import is logged, runs `importBody` and exits 0;
// any other call is logged and runs `body`.
function stubs({ version = MONO, body, importBody = ":" }) {
  const bin = mkdtempSync(join(tmpdir(), "gv-"));
  writeFileSync(join(bin, "dotnet"), "#!/bin/sh\nexit 0\n");
  writeFileSync(join(bin, "godot"), [
    "#!/bin/sh",
    `if [ "$1" = "--version" ]; then echo ${version}; exit 0; fi`,
    'echo "$*" >> "$ATLAS_STUB_LOG"',
    `case " $* " in *" --import "*) ${importBody}; exit 0;; esac`,
    body, "",
  ].join("\n"));
  chmodSync(join(bin, "dotnet"), 0o755); chmodSync(join(bin, "godot"), 0o755);
  return bin;
}
function project({ imported = true } = {}) {
  const p = mkdtempSync(join(tmpdir(), "gv-proj-"));
  if (imported) mkdirSync(join(p, ".godot/imported"), { recursive: true });
  return p;
}
function run(bin, { proj = project(), env = {} } = {}) {
  const log = join(proj, "stub.log");
  const r = spawnSync("bash", [join(ROOT, "scripts/godot-verify.sh"), "ATLAS_VERIFY_PIPELINE_CHAR", "^\\[PipelineCharVerify\\] VERDICT PASS$"], {
    encoding: "utf8", timeout: 30000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ATLAS_GODOT_MONO: join(bin, "godot"),
      ATLAS_GODOT_PROJECT: proj, ATLAS_STUB_LOG: log, ...env },
  });
  return { ...r, calls: existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [] };
}

test("exit 0 without the PASS line is a failure", () => {
  assert.equal(run(stubs({ body: 'echo "[PipelineCharVerify] BEGIN"; exit 0' })).status, 1);
});
test("PASS line with a non-zero exit is a failure", () => {
  assert.equal(run(stubs({ body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 1' })).status, 1);
});
test("a non-mono binary is refused", () => {
  assert.equal(run(stubs({ version: "4.7.2.stable.official.ed1daf0bf", body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 0' })).status, 1);
});
test("PASS line and exit 0 pass, and the probe env var reaches the binary", () => {
  const r = run(stubs({ body: '[ "$ATLAS_VERIFY_PIPELINE_CHAR" = 1 ] || exit 1; echo "[PipelineCharVerify] VERDICT PASS"; exit 0' }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test("a probe that never quits fails on the timeout instead of hanging", () => {
  const r = run(stubs({ body: "sleep 20; exit 0" }), { env: { ATLAS_GODOT_TIMEOUT: "2" } });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /timed out after 2s/);
});
test("a fresh project (no .godot/imported) is imported before the probe runs", () => {
  const r = run(stubs({ body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 0' }), { proj: project({ imported: false }) });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.calls[0], /--headless --path \S+ --import/);
  assert.doesNotMatch(r.calls[1], /--import/);
});
test("the import has its own, longer bound: a 3 s import passes under a 2 s probe timeout", () => {
  const r = run(stubs({ body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 0', importBody: "sleep 3" }),
    { proj: project({ imported: false }), env: { ATLAS_GODOT_TIMEOUT: "2", ATLAS_GODOT_IMPORT_TIMEOUT: "10" } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test("an import past ATLAS_GODOT_IMPORT_TIMEOUT fails and names the import bound", () => {
  const r = run(stubs({ body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 0', importBody: "sleep 5" }),
    { proj: project({ imported: false }), env: { ATLAS_GODOT_IMPORT_TIMEOUT: "1" } });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /godot --import timed out after 1s \(ATLAS_GODOT_IMPORT_TIMEOUT\)/);
});
test("a pulled glb without its .import sidecar also triggers the import", () => {
  const proj = project();
  mkdirSync(join(proj, "studio-cache"));
  writeFileSync(join(proj, "studio-cache", `${"a".repeat(64)}.glb`), "x");
  const r = run(stubs({ body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 0' }), { proj });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.calls[0], /--import/);
});
```

```csharp test:game-client/src/World/PipelineCharVerify.cs
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Godot;
using AtlasWorld.Client.Content;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// F-174 env-gated probe (ATLAS_VERIFY_PIPELINE_CHAR=1), run by VerticalSliceRoot (the main scene; GameRoot never runs).
    /// Unlike the synchronous probes it is a Node, because bone attachments only follow the
    /// skeleton after a process frame. Prints PASS/FAIL lines and exactly one
    /// "[PipelineCharVerify] VERDICT PASS" (exit 0) or "VERDICT FAIL (n)" (exit 1).
    /// Run it with scripts/godot-verify.sh (pinned mono build); PATH godot exits 0 on C# failure.
    /// </summary>
    public sealed partial class PipelineCharVerify : Node
    {
        public const string Key = "npc:lantern_hollow_watch_sergeant";
        public const string MobKey = "mob:aggressive";
        private const string Tag = "[PipelineCharVerify]";
        private int _failures;

        public override async void _Ready()
        {
            GD.Print($"{Tag} BEGIN");
            try
            {
                await RunAll();
            }
            catch (Exception ex)
            {
                Report($"no exception escaped the probe ({ex.GetType().Name}: {ex.Message})", false);
            }
            bool pass = _failures == 0;
            GD.Print(pass ? $"{Tag} VERDICT PASS" : $"{Tag} VERDICT FAIL ({_failures} case(s))");
            GetTree().Quit(pass ? 0 : 1);
        }

        private async Task RunAll()
        {
            AssetRegistry? reg = AssetRegistry.Instance;
            if (!Report("AssetRegistry autoload ready", reg != null))
                return;
            CheckManifest(reg!);
            await NextFrames(1);
        }

        private void CheckManifest(AssetRegistry reg)
        {
            reg.Resolve(Key, out ResolveTier tier);
            Report($"{Key} resolves to the bespoke glb (tier={tier})", tier == ResolveTier.Bespoke);
            IReadOnlyDictionary<string, string> anims = reg.ResolveAnimOverrides(Key);
            IReadOnlyDictionary<string, IReadOnlyList<string>> variants = reg.ResolveAnimVariants(Key);
            Report("anims maps combat_idle → block_idle", anims.GetValueOrDefault("combat_idle") == "block_idle");
            Report("attack variants are [attack, attack_2, attack_3]",
                variants.TryGetValue("attack", out IReadOnlyList<string>? a) && string.Join(",", a) == "attack,attack_2,attack_3");
            Report("anims[attack] keeps the first variant for legacy callers", anims.GetValueOrDefault("attack") == "attack");

            AssetManifest parsed = AssetManifest.Parse(
                "{\"version\":2,\"entries\":{\"x\":{\"scene\":\"res://a.glb\",\"anims\":{\"attack\":[\"a\",3,\"b\"],\"hit\":[],\"idle\":\"i\"}}}}");
            parsed.TryGet("x", out AssetEntry e);
            Report("a list drops non-string elements", e.AnimVariants.TryGetValue("attack", out IReadOnlyList<string>? pa) && string.Join(",", pa) == "a,b");
            Report("an empty list maps nothing", !e.Anims.ContainsKey("hit") && !e.AnimVariants.ContainsKey("hit"));
            Report("a string value is a one-item variant list", e.AnimVariants.TryGetValue("idle", out IReadOnlyList<string>? pi) && pi.Count == 1 && pi[0] == "i");
        }

        private async Task NextFrames(int n)
        {
            for (int i = 0; i < n; i++)
                await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
        }

        private bool Report(string name, bool ok)
        {
            GD.Print($"{Tag}   {(ok ? "PASS" : "FAIL")}  {name}");
            if (!ok)
                _failures++;
            return ok;
        }

        private static T? FindFirst<T>(Node node) where T : Node
        {
            if (node is T hit)
                return hit;
            foreach (Node child in node.GetChildren())
            {
                T? found = FindFirst<T>(child);
                if (found != null)
                    return found;
            }
            return null;
        }
    }
}
```

Verify-Cmd: `cd $WT && node --test scripts/tests/godot-verify.test.mjs && scripts/godot-verify.sh ATLAS_VERIFY_PIPELINE_CHAR '^\[PipelineCharVerify\] VERDICT PASS$'`

Expected FAIL: first `bash: scripts/godot-verify.sh: No such file or directory` (node test status 127 ≠ 0/1). After the script exists: `dotnet build` error `CS1061: 'AssetRegistry' does not contain a definition for 'ResolveAnimVariants'`.

**Step 2: minimal implementation**

`scripts/godot-verify.sh` (chmod +x):

```bash
#!/usr/bin/env bash
# Run one env-gated Godot C# probe on the pinned mono build and require its PASS line (F-174).
# PATH `godot` is the non-mono build: it prints "Can't load script" on C# and still exits 0,
# so neither an exit code nor the PATH binary proves anything. Every Godot call is bounded:
# probes by ATLAS_GODOT_TIMEOUT (default 180 s), the --import of a fresh worktree (~633 glbs) by
# ATLAS_GODOT_IMPORT_TIMEOUT (default 900 s). A call that never quits FAILS, it never hangs.
#   scripts/godot-verify.sh ATLAS_VERIFY_PIPELINE_CHAR '^\[PipelineCharVerify\] VERDICT PASS$'
set -uo pipefail
env_name="${1:?usage: godot-verify.sh <ENV_NAME> <PASS_REGEX>}"
pass_re="${2:?usage: godot-verify.sh <ENV_NAME> <PASS_REGEX>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${ATLAS_GODOT_PROJECT:-$REPO_ROOT/game-client}"
GODOT="${ATLAS_GODOT_MONO:-$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot}"
SECS="${ATLAS_GODOT_TIMEOUT:-180}"
IMPORT_SECS="${ATLAS_GODOT_IMPORT_TIMEOUT:-900}"

# bounded <secs> <cmd…>: coreutils timeout/gtimeout when present (both are on this Mac), else perl alarm.
bounded() {
  local secs="$1"; shift
  local t; t=$(command -v timeout || command -v gtimeout || true)
  if [ -n "$t" ]; then "$t" "$secs" "$@"; else perl -e 'alarm shift; exec @ARGV or die "exec: $!"' "$secs" "$@"; fi
}
timed_out() { [ "$1" -eq 124 ] || [ "$1" -eq 142 ]; }   # 124 = timeout(1), 142 = SIGALRM (perl)

[ -x "$GODOT" ] || { echo "❌ mono Godot not found: $GODOT (set ATLAS_GODOT_MONO)"; exit 1; }
bounded "$SECS" "$GODOT" --version 2>/dev/null | grep -q '\.mono\.' || { echo "❌ $GODOT is not a mono build"; exit 1; }
dotnet build "$PROJECT/GameClient.csproj" -nologo -v q || { echo "❌ dotnet build failed"; exit 1; }

# A fresh worktree has no .godot/imported and a fresh pull has no .import sidecar. Import first,
# or the res:// loads fail and the probe reports a confusing "instances a Node3D" FAIL.
needs_import=0
[ -d "$PROJECT/.godot/imported" ] || needs_import=1
for g in "$PROJECT"/studio-cache/*.glb; do
  if [ -e "$g" ] && [ ! -e "$g.import" ]; then needs_import=1; fi
done
if [ "$needs_import" = 1 ]; then
  echo "▶ godot --import (fresh worktree or new pull)"
  bounded "$IMPORT_SECS" "$GODOT" --headless --path "$PROJECT" --import >/dev/null 2>&1; rc=$?
  timed_out "$rc" && { echo "❌ godot --import timed out after ${IMPORT_SECS}s (ATLAS_GODOT_IMPORT_TIMEOUT)"; exit 1; }
  [ "$rc" -eq 0 ] || { echo "❌ godot --import exited $rc"; exit 1; }
fi

out=$(export "$env_name=1"; bounded "$SECS" "$GODOT" --headless --path "$PROJECT" 2>&1); rc=$?
printf '%s\n' "$out" | grep -E '^\[[A-Za-z]+(Verify|Probe)\]|ERROR|Unhandled'
timed_out "$rc" && { echo "❌ probe $env_name timed out after ${SECS}s (it never quit)"; exit 1; }
[ "$rc" -eq 0 ] || { echo "❌ probe $env_name exited $rc"; exit 1; }
grep -Eq "$pass_re" <<<"$out" || { echo "❌ probe $env_name printed no line matching $pass_re"; exit 1; }
echo "✅ probe $env_name passed"
```

`scripts/system-deps.json`: add two entries (`required: false`, so a laptop without them still ships other work; `godot-verify.sh` fails closed on its own when the section runs):

```json
    {
      "name": "dotnet",
      "package": ".NET 8 SDK",
      "required": false,
      "requiredNote": "Only the path-gated Gate 1 pipeline-character section (scripts/godot-verify.sh) builds game-client/GameClient.csproj; that section fails closed without it.",
      "usedBy": ["scripts/godot-verify.sh"],
      "verify": "dotnet --version",
      "macos": { "install": "brew install --cask dotnet-sdk" },
      "debian": { "install": "sudo apt-get update -qq && sudo apt-get install -y -qq dotnet-sdk-8.0" }
    },
    {
      "name": "godot-mono",
      "package": "Godot 4.7.2 .NET (mono) build — NOT the PATH godot",
      "required": false,
      "requiredNote": "Not on PATH: scripts/godot-verify.sh runs $ATLAS_GODOT_MONO (default ~/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot) and refuses any binary whose --version lacks '.mono.'. PATH godot is non-mono and exits 0 on C# failure.",
      "usedBy": ["scripts/godot-verify.sh"],
      "verify": "\"$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot\" --version",
      "macos": { "install": "download Godot_v4.7.2-stable_mono_macos.universal.zip from godotengine.org and unzip to ~/Applications/godot-mono-4.7.2/" }
    }
```

`AssetManifest.cs`: in `AssetEntry` after `Anims`:

```csharp
        /// <summary>
        /// Per-state clip variants (F-174): a manifest value may be one clip name or a list
        /// (attack variants). <see cref="Anims"/> keeps the first variant so existing callers
        /// are unchanged. Empty (never null) when the entry has no <c>anims</c> object.
        /// </summary>
        public IReadOnlyDictionary<string, IReadOnlyList<string>> AnimVariants { get; init; } =
            new Dictionary<string, IReadOnlyList<string>>();
```

Beside `var anims = new Dictionary<string, string>();` add `var animVariants = new Dictionary<string, IReadOnlyList<string>>();`. Replace the anims loop body:

```csharp
                                        foreach (JsonProperty animProp in field.Value.EnumerateObject())
                                        {
                                            if (animProp.Value.ValueKind == JsonValueKind.String)
                                            {
                                                string clip = animProp.Value.GetString() ?? "";
                                                anims[animProp.Name] = clip;
                                                animVariants[animProp.Name] = new[] { clip };
                                            }
                                            else if (animProp.Value.ValueKind == JsonValueKind.Array)
                                            {
                                                var list = new List<string>();
                                                foreach (JsonElement item in animProp.Value.EnumerateArray())
                                                {
                                                    string? s = item.ValueKind == JsonValueKind.String ? item.GetString() : null;
                                                    if (!string.IsNullOrEmpty(s))
                                                        list.Add(s);
                                                }
                                                if (list.Count > 0)
                                                {
                                                    anims[animProp.Name] = list[0];
                                                    animVariants[animProp.Name] = list;
                                                }
                                            }
                                        }
```

and `AnimVariants = animVariants,` in the `new AssetEntry { … }` initializer.

`AssetRegistry.cs` after `EmptyAnims`:

```csharp
        /// <summary>Per-state clip variants for a type id (F-174). Empty, never null. Total, never throws.</summary>
        public IReadOnlyDictionary<string, IReadOnlyList<string>> ResolveAnimVariants(string typeId)
        {
            if (_manifest != null && _manifest.TryGet(typeId, out AssetEntry entry))
                return entry.AnimVariants;
            return EmptyAnimVariants;
        }

        private static readonly Dictionary<string, IReadOnlyList<string>> EmptyAnimVariants = new();
```

`VerticalSliceRoot.cs` after the `ATLAS_VERIFY_FACING` block (line 164). It is the only hook, because `GameRoot`'s scene never runs (Facts #2):

```csharp
            // Env-gated F-174 probe (ATLAS_VERIFY_PIPELINE_CHAR=1). Unlike the probes above it
            // spans frames (bone attachments update on process), so it is a child Node that
            // quits the tree itself. Stop this root's own frame work so nothing else runs.
            if (OS.GetEnvironment("ATLAS_VERIFY_PIPELINE_CHAR") == "1")
            {
                SetProcess(false);
                SetPhysicsProcess(false);
                SetProcessInput(false);
                SetProcessUnhandledInput(false);
                AddChild(new PipelineCharVerify { Name = "PipelineCharVerify" });
                return;
            }
```

**Step 3: run → PASS** (Verify-Cmd prints `VERDICT PASS`, exit 0). Then the regression: `scripts/godot-verify.sh ATLAS_VERIFY_ANIM '^\[AnimationVerify\] RESULT: PASS'`. (Rev 1 also called `ATLAS_VERIFY_MANIFEST`. That hook exists only in `GameRoot.cs:37`, whose scene never runs, so the call would have booted the slice and waited until it hung. It is dropped. The 180 s bound now turns any such mistake into a FAIL.) Then `node scripts/check-system-deps.mjs` prints the `dotnet` and `godot-mono` notes and still ends `RESULT: all required system binaries are present.`

**Step 4: README.** In the repo `README.md` §"3. Build & Run Godot", add "Verify probes (pinned mono)" with the `godot-verify.sh` lines for ANIM and PIPELINE_CHAR, and the warning that PATH `godot` is non-mono.

**Step 5: commit** `feat(client): manifest anim variants + PipelineCharVerify probe runner (F-174)`.

**Phase gate:** both probes PASS on mono; `node --test scripts/tests/godot-verify.test.mjs` green.

---

## Task 5: Combat state machine in `AnimationController`

**Files:**
- Modify: `game-client/src/World/AnimationController.cs`: constants (lines 15-35), ctor (lines 48-56), `Update` (lines 61-74), `PlayState` fallback switch and blend (lines 121-154), `ConfigureLoopModes` (lines 157-171)
- Modify (test): `game-client/src/World/PipelineCharVerify.cs` (add `CheckStates`, `CheckReadyTransitions`, `CheckMobBlend`, and the `Spawned` helper)

**Interfaces:**
- Consumes: `AssetRegistry.ResolveAnimVariants` (Task 4).
- Produces (on `AnimationController`): ctor `AnimationController(Node modelRoot, IReadOnlyDictionary<string,string>? clipOverrides = null, IReadOnlyDictionary<string, IReadOnlyList<string>>? clipVariants = null)`; `bool IsCombatMapped { get; }`; `bool InCombat { get; set; }`; `string CurrentState { get; }`; `string CurrentClip { get; }`; `double LastBlendSec { get; }`; `void Attack()`; `void Block(bool active = true)`; `void Hit()`; public state constants `StateIdle … StateReadyOut`. `Update(bool isAlive, Vector3 velocity, bool isAttacking = false)` is unchanged for entries without `combat_idle`.

**Step 1: failing test** (add to `PipelineCharVerify`; call `await CheckStates(reg!); CheckReadyTransitions(reg!); CheckMobBlend(reg!); CheckFallbackOrder();` from `RunAll` after `CheckManifest`)

```csharp test:game-client/src/World/PipelineCharVerify.cs
        private sealed class Spawned
        {
            public Node3D Root = null!;
            public AnimationController Anim = null!;
            public AnimationPlayer Player = null!;
        }

        private Spawned? Spawn(AssetRegistry reg, string key, IReadOnlyDictionary<string, string>? anims = null)
        {
            if (reg.Resolve(key, out _).Instantiate() is not Node3D root)
            {
                Report($"{key} instances a Node3D", false);
                return null;
            }
            AddChild(root);
            var anim = new AnimationController(root, anims ?? reg.ResolveAnimOverrides(key), reg.ResolveAnimVariants(key));
            AnimationPlayer? player = FindFirst<AnimationPlayer>(root);
            if (!Report($"{key} has an AnimationPlayer", player != null))
                return null;
            return new Spawned { Root = root, Anim = anim, Player = player! };
        }

        private bool Expect(Spawned s, string label, string state, string clip) =>
            Report($"{label}: state={s.Anim.CurrentState} clip={s.Player.CurrentAnimation} (want {state}/{clip})",
                s.Anim.CurrentState == state && s.Player.CurrentAnimation == clip && s.Player.IsPlaying());

        /// <summary>Run the current non-looping clip past its end, as frames would.</summary>
        private static void FinishOneShot(AnimationPlayer p) =>
            p.Advance(p.CurrentAnimationLength - p.CurrentAnimationPosition + 0.05);

        private async Task CheckStates(AssetRegistry reg)
        {
            Spawned? s = Spawn(reg, Key);
            if (s == null)
                return;
            Report("sergeant is combat-mapped", s.Anim.IsCombatMapped);

            var loops = new (string clip, Animation.LoopModeEnum mode)[]
            {
                ("idle", Animation.LoopModeEnum.Linear), ("walk", Animation.LoopModeEnum.Linear),
                ("run", Animation.LoopModeEnum.Linear), ("block_idle", Animation.LoopModeEnum.Linear),
                ("block", Animation.LoopModeEnum.Linear), ("attack", Animation.LoopModeEnum.None),
                ("attack_2", Animation.LoopModeEnum.None), ("attack_3", Animation.LoopModeEnum.None),
                ("hit", Animation.LoopModeEnum.None), ("death", Animation.LoopModeEnum.None),
            };
            foreach ((string clip, Animation.LoopModeEnum mode) in loops)
                Report($"loop mode {clip} = {mode}", s.Player.HasAnimation(clip) && s.Player.GetAnimation(clip).LoopMode == mode);

            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "still", "idle", "idle");
            s.Anim.Update(true, new Vector3(1.5f, 0f, 0f));
            Expect(s, "slow", "walk", "walk");
            s.Anim.Update(true, new Vector3(12f, 0f, 0f));
            Expect(s, "fast", "run", "run");

            s.Anim.InCombat = true;
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "InCombat", "combat_idle", "block_idle");
            s.Anim.Block(true);
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "Block(true)", "block", "block");
            s.Anim.Block(false);
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "Block(false)", "combat_idle", "block_idle");

            foreach (string want in new[] { "attack", "attack_2", "attack_3", "attack" })
            {
                s.Anim.Attack();
                s.Anim.Update(true, Vector3.Zero);
                Expect(s, $"Attack() rotates to {want}", "attack", want);
                Report($"attack blend 0.15 s for the combat-mapped sergeant (got {s.Anim.LastBlendSec})",
                    Math.Abs(s.Anim.LastBlendSec - 0.15) < 1e-9);
                s.Anim.Update(true, Vector3.Zero);
                Expect(s, "attack still playing (no restart)", "attack", want);
                FinishOneShot(s.Player);
                s.Anim.Update(true, Vector3.Zero);
                Expect(s, "attack ended in combat", "combat_idle", "block_idle");
            }

            s.Anim.Hit();
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "Hit()", "hit", "hit");
            FinishOneShot(s.Player);
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "hit ended in combat", "combat_idle", "block_idle");

            // Spec sequence: idle → combat_idle → attack → combat_idle → idle
            var seq = new List<string>();
            s.Anim.InCombat = false; s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            s.Anim.InCombat = true; s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            s.Anim.Attack(); s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            FinishOneShot(s.Player); s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            s.Anim.InCombat = false; s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            Report($"sequence {string.Join("→", seq)}", string.Join("→", seq) == "idle→combat_idle→attack→combat_idle→idle");

            s.Anim.Hit();
            s.Anim.Update(true, Vector3.Zero);
            FinishOneShot(s.Player);
            s.Anim.Update(true, Vector3.Zero);
            Expect(s, "hit out of combat returns to idle", "idle", "idle");

            s.Anim.Update(false, Vector3.Zero);
            Expect(s, "dead", "death", "death");
            Skeleton3D? skel = FindFirst<Skeleton3D>(s.Root);
            int hips = skel?.FindBone("mixamorig_Hips") ?? -1;
            Report("mixamorig_Hips bone found", hips >= 0);
            FinishOneShot(s.Player);
            Transform3D held1 = skel!.GetBonePose(hips);
            s.Player.Advance(0.5);
            s.Anim.Update(false, Vector3.Zero);
            Transform3D held2 = skel.GetBonePose(hips);
            Report("death holds its last frame (no restart, hips pose unchanged)",
                s.Anim.CurrentState == "death" && s.Player.AssignedAnimation == "death" && !s.Player.IsPlaying() && held1.IsEqualApprox(held2));

            s.Root.QueueFree();
            await NextFrames(1);
        }

        private void CheckReadyTransitions(AssetRegistry reg)
        {
            // The sergeant maps no ready_in/ready_out; map them to a real clip to prove the path.
            var anims = new Dictionary<string, string>(reg.ResolveAnimOverrides(Key))
            {
                ["ready_in"] = "idle_look",
                ["ready_out"] = "idle_look",
            };
            Spawned? s = Spawn(reg, Key, anims);
            if (s == null)
                return;
            var seq = new List<string>();
            s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            s.Anim.InCombat = true; s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            FinishOneShot(s.Player); s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            s.Anim.InCombat = false; s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            FinishOneShot(s.Player); s.Anim.Update(true, Vector3.Zero); seq.Add(s.Anim.CurrentState);
            Report($"mapped ready_in/ready_out: {string.Join("→", seq)}",
                string.Join("→", seq) == "idle→ready_in→combat_idle→ready_out→idle");
            s.Root.QueueFree();
        }

        private void CheckMobBlend(AssetRegistry reg)
        {
            Spawned? m = Spawn(reg, MobKey);
            if (m == null)
                return;
            Report("existing mob is not combat-mapped", !m.Anim.IsCombatMapped);
            m.Anim.Update(true, Vector3.Zero, isAttacking: true);
            Report($"existing mob attack blend stays 0.05 s (got {m.Anim.LastBlendSec})", Math.Abs(m.Anim.LastBlendSec - 0.05) < 1e-9);
            m.Root.QueueFree();
        }

        /// <summary>
        /// The fallback list prefers the pipeline name over the Kenney name: run before sprint,
        /// death before die. Built in code (no glb), so only the order is under test.
        /// </summary>
        private void CheckFallbackOrder()
        {
            var fast = new Vector3(12f, 0f, 0f);
            FallbackCase("run beats sprint", new[] { "idle", "sprint", "run" }, alive: true, fast, want: "run");
            FallbackCase("sprint when run is absent", new[] { "idle", "sprint" }, alive: true, fast, want: "sprint");
            FallbackCase("death beats die", new[] { "idle", "die", "death" }, alive: false, Vector3.Zero, want: "death");
            FallbackCase("die when death is absent", new[] { "idle", "die" }, alive: false, Vector3.Zero, want: "die");
        }

        private void FallbackCase(string label, string[] clips, bool alive, Vector3 velocity, string want)
        {
            var root = new Node3D { Name = "FallbackModel" };
            var player = new AnimationPlayer { Name = "AnimationPlayer" };
            var lib = new AnimationLibrary();
            foreach (string c in clips)
                lib.AddAnimation(c, new Animation { Length = 1f });
            player.AddAnimationLibrary("", lib);
            root.AddChild(player);
            AddChild(root);
            var anim = new AnimationController(root);
            anim.Update(alive, velocity);
            Report($"fallback {label}: [{string.Join(",", clips)}] → {anim.CurrentClip} (want {want})", anim.CurrentClip == want);
            root.QueueFree();
        }
```

Verify-Cmd: `cd $WT && scripts/godot-verify.sh ATLAS_VERIFY_PIPELINE_CHAR '^\[PipelineCharVerify\] VERDICT PASS$'`

Expected FAIL: `dotnet build` errors `CS1061: 'AnimationController' does not contain a definition for 'IsCombatMapped'` (and `InCombat`, `Attack`, …).

**Step 2: minimal implementation** (edits to `AnimationController.cs`)

Constants: make the five existing state constants `public const` and add:

```csharp
        public const string StateCombatIdle = "combat_idle";
        public const string StateBlock = "block";
        public const string StateHit = "hit";
        public const string StateReadyIn = "ready_in";
        public const string StateReadyOut = "ready_out";
        // F-174: a softer blend into attack, only for entries that map combat_idle.
        private const double CombatAttackBlendSec = 0.15;
```

Fields and ctor:

```csharp
        private readonly IReadOnlyList<string> _attackClips;
        private int _attackIndex;
        private string? _oneShotState;
        private string? _oneShotClip;
        private bool _pendingAttack;
        private bool _pendingHit;
        private bool _blocking;
        private bool _inStance;

        public AnimationController(Node modelRoot, IReadOnlyDictionary<string, string>? clipOverrides = null,
            IReadOnlyDictionary<string, IReadOnlyList<string>>? clipVariants = null)
        {
            _modelRoot = modelRoot as Node3D;
            _player = FindAnimationPlayer(modelRoot);
            _clipMap = MergeClipMap(clipOverrides);
            IsCombatMapped = clipOverrides != null &&
                clipOverrides.TryGetValue(StateCombatIdle, out string? ci) && !string.IsNullOrEmpty(ci);
            _attackClips = clipVariants != null && clipVariants.TryGetValue(StateAttack, out IReadOnlyList<string>? v) && v.Count > 0
                ? v
                : new[] { _clipMap[StateAttack] };

            if (_player != null)
                ConfigureLoopModes();
        }

        /// <summary>True when the manifest entry maps combat_idle; only then does the combat path run.</summary>
        public bool IsCombatMapped { get; }
        /// <summary>Client-side stance flag (F-174): set from the entity having a server target_id.</summary>
        public bool InCombat { get; set; }
        public string CurrentState => _lastState;
        public string CurrentClip { get; private set; } = "";
        public double LastBlendSec { get; private set; }
        /// <summary>Queue one attack one-shot; variants rotate. No server signal for remote entities yet (I-255).</summary>
        public void Attack() => _pendingAttack = true;
        /// <summary>Hold or release the block loop while InCombat. No server signal yet (I-255).</summary>
        public void Block(bool active = true) => _blocking = active;
        /// <summary>Queue one hit one-shot (wired from GameEvent.Hit).</summary>
        public void Hit() => _pendingHit = true;
```

`Update`: first line `if (IsCombatMapped) { UpdateCombat(isAlive, velocity); return; }`, the rest unchanged. New methods:

```csharp
        private void UpdateCombat(bool isAlive, Vector3 velocity)
        {
            bool restart = false;
            string state = ResolveCombatState(isAlive, velocity, ref restart);
            if (state == _lastState && !restart)
                return;

            _lastState = state;
            FireAudioForState(state);
            if (_player == null || !GodotObject.IsInstanceValid(_player))
                return;
            PlayState(state);
        }

        // Priority: death > running one-shot > hit > attack > locomotion > stance.
        private string ResolveCombatState(bool isAlive, Vector3 velocity, ref bool restart)
        {
            if (!isAlive)
            {
                _oneShotState = null;
                return StateDeath;
            }
            if (_oneShotState != null)
            {
                if (OneShotPlaying())
                    return _oneShotState;
                _oneShotState = null;
            }
            if (_pendingHit)
            {
                _pendingHit = false;
                if (HasClip(StateHit))
                    return StartOneShot(StateHit, ref restart);
            }
            if (_pendingAttack)
            {
                _pendingAttack = false;
                return StartOneShot(StateAttack, ref restart);
            }

            float speed = velocity.Length();
            if (speed >= SprintSpeedThreshold)
                return StateRun;
            if (speed >= WalkSpeedThreshold)
                return StateWalk;

            if (InCombat)
            {
                if (!_inStance)
                {
                    _inStance = true;
                    if (HasClip(StateReadyIn))
                        return StartOneShot(StateReadyIn, ref restart);
                }
                return _blocking && HasClip(StateBlock) ? StateBlock : StateCombatIdle;
            }
            if (_inStance)
            {
                _inStance = false;
                if (HasClip(StateReadyOut))
                    return StartOneShot(StateReadyOut, ref restart);
            }
            return StateIdle;
        }

        private string StartOneShot(string state, ref bool restart)
        {
            _oneShotState = state;
            restart = true;
            return state;
        }

        private bool OneShotPlaying() =>
            _player != null && _oneShotClip != null && _player.IsPlaying() && _player.CurrentAnimation == _oneShotClip;

        private bool HasClip(string state) =>
            _player != null && _clipMap.TryGetValue(state, out string? c) && !string.IsNullOrEmpty(c) && _player.HasAnimation(c);
```

`PlayState`: after the `TryGetValue(state, out clip)` guard, choose the attack variant on the combat path:

```csharp
            if (IsCombatMapped && state == StateAttack)
                clip = _attackClips[_attackIndex++ % _attackClips.Count];
```

Fallback switch: `StateRun => … _player.HasAnimation("run") ? "run" : _player.HasAnimation("sprint") ? "sprint" : null,` and `StateDeath => … _player.HasAnimation("death") ? "death" : _player.HasAnimation("die") ? "die" : null,`. Replace the blend line and record what played:

```csharp
            double blend = state switch
            {
                StateAttack => IsCombatMapped ? CombatAttackBlendSec : OneShotBlendSec,
                StateDeath or StateHit or StateReadyIn or StateReadyOut => OneShotBlendSec,
                _ => LoopBlendSec,
            };
            _player.Play(clip, customBlend: blend);
            LastBlendSec = blend;
            CurrentClip = clip;
            if (state is StateAttack or StateHit or StateReadyIn or StateReadyOut)
                _oneShotClip = clip;
```

`ConfigureLoopModes`: append

```csharp
            SetLoopMode(StateCombatIdle, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateBlock, Animation.LoopModeEnum.Linear);
            SetLoopMode(StateHit, Animation.LoopModeEnum.None);
            SetLoopMode(StateReadyIn, Animation.LoopModeEnum.None);
            SetLoopMode(StateReadyOut, Animation.LoopModeEnum.None);
            foreach (string c in _attackClips)
                SetRawClipLoop(c, Animation.LoopModeEnum.None);
```

`ConfigureLoopModes` reads `_attackClips`, so assign `_attackClips` before calling it (the ctor order above already does).

**Step 3: run → PASS** (Verify-Cmd), then the regression `scripts/godot-verify.sh ATLAS_VERIFY_ANIM '^\[AnimationVerify\] RESULT: PASS'` (the player entry has no `combat_idle`, so the legacy path runs).

**Step 4: README.** Nothing user-facing beyond Task 4's probe section; add one line there listing the combat states.

**Step 5: commit FIRST** `feat(client): combat state machine for combat-mapped entries (F-174)`. The mutations below revert from `HEAD`, so they must run on a committed tree. In rev 1 the order was revert-then-commit, and that revert would have wiped the uncommitted implementation.

**Step 6: proven red (covering suite), on the committed tree.** Mutate, run, revert, one at a time, and each must flip the verdict to `VERDICT FAIL`, exit 1:
(a) `CombatAttackBlendSec = 0.05` (the attack-blend case fails);
(b) remove `_attackIndex++` (the rotation case fails);
(c) delete `SetLoopMode(StateBlock, Linear)` (the loop-mode case fails);
(d) swap the run fallback to `sprint` before `run` (the `run beats sprint` case fails).

After each one, revert with `git checkout HEAD -- game-client/src/World/AnimationController.cs`, then prove the revert: `git diff --exit-code HEAD -- game-client/src/World/AnimationController.cs` exits 0 before the next mutation. Last, re-run the Verify-Cmd → `VERDICT PASS`.

**Phase gate:** PIPELINE_CHAR and ANIM probes PASS; the mutations were each shown red.

---

## Task 6: `WeaponSocket` runtime weapon swap

**Files:**
- Create: `game-client/src/World/WeaponSocket.cs`
- Modify (test): `game-client/src/World/PipelineCharVerify.cs` (add `CheckWeaponSwap`; call `await CheckWeaponSwap(reg!);` in `RunAll`)

**Interfaces:**
- Produces: `sealed class WeaponSocket(Node3D modelRoot)`; `BoneAttachment3D? Attachment { get; }`; `Node3D? Equipped { get; }`; `Node3D? Equip(PackedScene weapon)` (returns the instance, or null with one warning); `void Unequip()`.

**Step 1: failing test**

```csharp test:game-client/src/World/PipelineCharVerify.cs
        private async Task CheckWeaponSwap(AssetRegistry reg)
        {
            Spawned? s = Spawn(reg, Key);
            if (s == null)
                return;
            Report("baked held_shaft_r exists before Equip", s.Root.FindChild("held_shaft_r", true, false) != null);
            PackedScene? axe = ResourceLoader.Load<PackedScene>("res://assets/weapons/axe.glb");
            if (!Report("axe.glb loads", axe != null))
                return;

            var socket = new WeaponSocket(s.Root);
            Node3D? equipped = socket.Equip(axe!);
            Report("no held_shaft_r remains after Equip", s.Root.FindChild("held_shaft_r", true, false) == null);
            Report($"one axe node under the hand BoneAttachment3D (bone={socket.Attachment?.BoneName})",
                equipped != null && socket.Attachment != null && socket.Attachment.GetChildCount() == 1 && socket.Attachment.GetChild(0) == equipped);

            Skeleton3D? skel = FindFirst<Skeleton3D>(s.Root);
            int hand = skel?.FindBone("mixamorig_RightHand") ?? -1;
            if (!Report("mixamorig_RightHand bone found", hand >= 0) || equipped == null)
                return;

            double len = s.Player.GetAnimation("attack").Length;
            (Vector3 p1, Vector3 o1) = await SampleAxe(s, skel!, hand, equipped, len * 0.2);
            (Vector3 p2, Vector3 o2) = await SampleAxe(s, skel!, hand, equipped, len * 0.6);
            float moved = p1.DistanceTo(p2);
            float drift = o1.DistanceTo(o2);
            Report($"axe moved {moved * 100f:F1} cm across two attack frames (> 1 cm)", moved > 0.01f);
            Report($"axe offset to mixamorig_RightHand drifted {drift * 1000f:F2} mm (<= 1 mm)", drift <= 0.001f);

            socket.Unequip();
            Report("Unequip leaves 0 children", socket.Attachment!.GetChildCount() == 0 && socket.Equipped == null);
            s.Root.QueueFree();

            // No socket on the model: Equip creates one on prop_weapon_r.
            Spawned? bare = Spawn(reg, Key);
            if (bare == null)
                return;
            foreach (Node n in bare.Root.FindChildren("*", nameof(BoneAttachment3D), true, false))
            {
                n.GetParent().RemoveChild(n);
                n.QueueFree();
            }
            var created = new WeaponSocket(bare.Root);
            created.Equip(axe!);
            Report($"missing socket is created on prop_weapon_r (got {created.Attachment?.BoneName})",
                created.Attachment != null && created.Attachment.BoneName == "prop_weapon_r");
            bare.Root.QueueFree();
            await NextFrames(1);
        }

        private async Task<(Vector3 pos, Vector3 handLocal)> SampleAxe(Spawned s, Skeleton3D skel, int hand, Node3D axe, double t)
        {
            s.Player.Play("attack");
            s.Player.Seek(t, true);
            s.Player.Pause();
            await NextFrames(2); // BoneAttachment3D follows the skeleton on process
            Transform3D handXf = skel.GlobalTransform * skel.GetBoneGlobalPose(hand);
            Vector3 pos = axe.GlobalPosition;
            return (pos, handXf.AffineInverse() * pos);
        }
```

Verify-Cmd: `cd $WT && scripts/godot-verify.sh ATLAS_VERIFY_PIPELINE_CHAR '^\[PipelineCharVerify\] VERDICT PASS$'`

Expected FAIL: `CS0246: The type or namespace name 'WeaponSocket' could not be found`.

**Step 2: minimal implementation** `WeaponSocket.cs`:

```csharp
using System;
using Godot;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// Runtime weapon swap (F-174). Finds the right-hand weapon BoneAttachment3D by its
    /// imported names (Godot turns glTF "handslot.r" into node "handslot_r" and
    /// "mixamorig:RightHand" into bone "mixamorig_RightHand"), frees what is baked under it,
    /// and instances the new weapon there. Grip alignment is the weapon's own origin until
    /// the weapon contract provides grip_main (known limit; the render strip shows it).
    /// </summary>
    public sealed class WeaponSocket
    {
        public const string SocketNodeName = "handslot_r";
        private static readonly string[] SocketBoneNames = { "handslot.r", "handslot_r", "prop_weapon_r" };
        private static readonly string[] FallbackBones = { "prop_weapon_r", "mixamorig_RightHand" };

        private readonly Node3D _modelRoot;

        public WeaponSocket(Node3D modelRoot) => _modelRoot = modelRoot;

        public BoneAttachment3D? Attachment { get; private set; }
        public Node3D? Equipped { get; private set; }

        public Node3D? Equip(PackedScene weapon)
        {
            BoneAttachment3D? socket = FindOrCreateSocket();
            if (socket == null)
            {
                GD.PushWarning($"WeaponSocket: no Skeleton3D with {string.Join("/", FallbackBones)} under '{_modelRoot.Name}'; weapon not equipped.");
                return null;
            }
            ClearChildren(socket);
            if (weapon.Instantiate() is not Node3D instance)
            {
                GD.PushWarning($"WeaponSocket: '{weapon.ResourcePath}' did not instance a Node3D.");
                return null;
            }
            instance.Name = "equipped_weapon";
            socket.AddChild(instance);
            Equipped = instance;
            return instance;
        }

        public void Unequip()
        {
            if (Attachment != null && GodotObject.IsInstanceValid(Attachment))
                ClearChildren(Attachment);
            Equipped = null;
        }

        private BoneAttachment3D? FindOrCreateSocket()
        {
            if (Attachment != null && GodotObject.IsInstanceValid(Attachment))
                return Attachment;
            BoneAttachment3D? found = FindSocket(_modelRoot);
            if (found != null)
                return Attachment = found;

            Skeleton3D? skel = FindSkeleton(_modelRoot);
            if (skel == null)
                return null;
            string? bone = Array.Find(FallbackBones, b => skel.FindBone(b) >= 0);
            if (bone == null)
                return null;
            var created = new BoneAttachment3D { Name = SocketNodeName, BoneName = bone };
            skel.AddChild(created);
            return Attachment = created;
        }

        private static BoneAttachment3D? FindSocket(Node node)
        {
            if (node is BoneAttachment3D ba &&
                (ba.Name == SocketNodeName || Array.IndexOf(SocketBoneNames, ba.BoneName) >= 0))
                return ba;
            foreach (Node child in node.GetChildren())
            {
                BoneAttachment3D? hit = FindSocket(child);
                if (hit != null)
                    return hit;
            }
            return null;
        }

        private static Skeleton3D? FindSkeleton(Node node)
        {
            if (node is Skeleton3D s)
                return s;
            foreach (Node child in node.GetChildren())
            {
                Skeleton3D? hit = FindSkeleton(child);
                if (hit != null)
                    return hit;
            }
            return null;
        }

        private static void ClearChildren(Node socket)
        {
            foreach (Node child in socket.GetChildren())
            {
                socket.RemoveChild(child); // detach now, so lookups this frame no longer see it
                child.QueueFree();
            }
        }
    }
}
```

**Step 3: run → PASS.** If the "creates on prop_weapon_r" case reports `mixamorig_RightHand`, the imported skeleton has no `prop_weapon_r` bone. Print `skel.GetBoneName(i)` for all bones once, record the real name, and fix `FallbackBones` (the spec says the bone exists; this is the check).

**Step 4: proven red** (spec: "A FAIL line exits 1, proven by renaming one mapped clip"):

**Commit FIRST:** `feat(client): WeaponSocket runtime weapon swap (F-174)`. `WeaponSocket.cs` is a new, untracked file until this commit, so a `git checkout` revert of it would fail or delete it. Every mutation below runs on the committed tree.

```bash
cd $WT && sed -i '' 's/"block_idle"/"block_idle_RENAMED"/' game-client/assets/manifest.json \
  && scripts/godot-verify.sh ATLAS_VERIFY_PIPELINE_CHAR '^\[PipelineCharVerify\] VERDICT PASS$'; echo "exit=$?"; \
  git checkout HEAD -- game-client/assets/manifest.json && git diff --exit-code HEAD -- game-client/assets/manifest.json
```

Expected: `FAIL  anims maps combat_idle → block_idle`, `VERDICT FAIL (n)`, `❌ probe … exited 1`, `exit=1`, and the diff check exits 0. Then mutate `ClearChildren` in `WeaponSocket.cs` to a no-op: the `no held_shaft_r remains` case must FAIL. Revert with `git checkout HEAD -- game-client/src/World/WeaponSocket.cs`, run `git diff --exit-code HEAD -- game-client/src/World/WeaponSocket.cs` (exit 0), and re-run the Verify-Cmd → `VERDICT PASS`.

**Step 5:** (no separate commit; the commit above is the task's commit.)

**Phase gate:** probe PASS; both mutations shown red on the committed tree; the working tree is clean after the reverts.

---

## Task 7: Wire InCombat (target_id) and Hit (GameEvent.Hit), client-only

**Files:**
- Modify: `game-client/src/World/EntityView.cs`: ctor scale line 78 and anim lines 81-85, `UpdateAnimation` line 375, plus two members
- Modify: `game-client/src/Content/AssetRegistry.cs`: `ResolveKind(string typeId) : string` (entry `Kind`, "" when absent)
- Modify: `game-client/src/VerticalSliceRoot.cs`: outgoing-hit branch, right after the `TryGetEntityView(ev.TargetId…)` success (around line 1555-1557)
- Modify (test): `PipelineCharVerify.cs` (add `CheckEntityViewWiring`; call it in `RunAll`)

**Interfaces:**
- Consumes: Task 5 API.
- Produces: `EntityView.Animation : AnimationController`; `EntityView.NotifyHit() : void`; `AssetRegistry.ResolveKind(typeId) : string`. An entry of kind `pipelineCharacter` renders at scale **1.0**, because it is authored at true size (1.05 u, Task 1). Every other entry keeps `ResolveChibiScaleFactor`, with NPC still at 0.68 (Facts #17).

**Step 1: failing test**

```csharp test:game-client/src/World/PipelineCharVerify.cs
        private void CheckEntityViewWiring()
        {
            // EntityManager sets isAttacking = (target_id != 0). For a combat-mapped entry that is InCombat.
            var view = new EntityView(EntityKind.Npc, Key);
            AddChild(view.Root);
            // EntityView.cs:208 scales every NPC 0.68 (tuned for 1.6-2.0 u bodies); a 1.05 u
            // pipeline character must render at true size, not 0.71 m.
            float h = WorldHeight(view.Root);
            Report($"pipeline character world height {h:F3} m (want 1.05 m ±5%)", Mathf.Abs(h - 1.05f) <= 0.0525f);
            Report("legacy NPC factor unchanged (0.68)", Math.Abs(EntityView.ResolveChibiScaleFactor(EntityKind.Npc, "npc") - 0.68f) < 1e-6);
            view.ApplyLifeState(isAlive: true, currentHealth: 100f, maxHealth: 100f, isAttacking: true);
            view.UpdateAnimation(Vector3.Zero);
            Report($"target_id → InCombat → combat_idle (state={view.Animation.CurrentState})",
                view.Animation.InCombat && view.Animation.CurrentState == "combat_idle");
            view.NotifyHit();
            view.UpdateAnimation(Vector3.Zero);
            Report($"GameEvent.Hit → hit (state={view.Animation.CurrentState})", view.Animation.CurrentState == "hit");
            view.ApplyLifeState(true, 90f, 100f, isAttacking: false);
            FinishOneShot(FindFirst<AnimationPlayer>(view.Root)!);
            view.UpdateAnimation(Vector3.Zero);
            Report($"no target → idle (state={view.Animation.CurrentState})", !view.Animation.InCombat && view.Animation.CurrentState == "idle");
            view.Root.QueueFree();

            // Legacy entries keep today's meaning: target_id → attack clip.
            var mob = new EntityView(EntityKind.Mob, MobKey);
            AddChild(mob.Root);
            mob.ApplyLifeState(true, 100f, 100f, isAttacking: true);
            mob.UpdateAnimation(Vector3.Zero);
            mob.NotifyHit(); // must be a no-op for a non-combat-mapped entry
            mob.UpdateAnimation(Vector3.Zero);
            Report($"legacy mob: target_id still → attack, Hit is a no-op (state={mob.Animation.CurrentState})",
                mob.Animation.CurrentState == "attack" && !mob.Animation.InCombat);
            mob.Root.QueueFree();
        }

        /// <summary>World-space height of every mesh under <paramref name="root"/> (rest-pose AABBs).</summary>
        private static float WorldHeight(Node root)
        {
            Aabb? box = null;
            foreach (Node n in root.FindChildren("*", nameof(MeshInstance3D), true, false))
            {
                var mi = (MeshInstance3D)n;
                Aabb a = mi.GlobalTransform * mi.GetAabb();
                box = box is Aabb b ? b.Merge(a) : a;
            }
            return box?.Size.Y ?? 0f;
        }
```

Verify-Cmd: `cd $WT && scripts/godot-verify.sh ATLAS_VERIFY_PIPELINE_CHAR '^\[PipelineCharVerify\] VERDICT PASS$'`

Expected FAIL: `CS1061: 'EntityView' does not contain a definition for 'Animation'` / `'NotifyHit'`. After those exist, and before the scale change, the height case fails with about `0.714 m`.

**Step 2: minimal implementation**

`AssetRegistry.cs` (beside `ResolveAnimVariants`):

```csharp
        /// <summary>Manifest <c>kind</c> of a type id ("" when there is no entry). Total, never throws.</summary>
        public string ResolveKind(string typeId) =>
            _manifest != null && _manifest.TryGet(typeId, out AssetEntry entry) ? entry.Kind : "";
```

`EntityView.cs` ctor. Replace line 78 (`_visualScale = ResolveChibiScaleFactor(kind, typeId);`):

```csharp
            // F-174: pipeline characters are authored at true size (validate kind pipelineCharacter,
            // 0.95-1.15 u). The chibi factors were tuned for 1.6-2.0 u Kenney/KayKit bodies, and the
            // 0.68 NPC factor would shrink the 1.05 u sergeant to ~0.71 m.
            _visualScale = AssetRegistry.Instance?.ResolveKind(typeId) == "pipelineCharacter"
                ? 1.0f
                : ResolveChibiScaleFactor(kind, typeId);
```

and the anim lines:

```csharp
            AssetRegistry? registry = AssetRegistry.Instance;
            IReadOnlyDictionary<string, string>? animOverrides = registry?.ResolveAnimOverrides(typeId);
            IReadOnlyDictionary<string, IReadOnlyList<string>>? animVariants = registry?.ResolveAnimVariants(typeId);
            _animController = new AnimationController(_root, animOverrides, animVariants);
```

Members (replace line 375):

```csharp
        public AnimationController Animation => _animController;

        /// <summary>
        /// Per-frame animation drive. <c>_isAttacking</c> is the server's target_id != 0
        /// (EntityManager). Combat-mapped entries (F-174) read it as a stance (InCombat); the
        /// server sends no attack flag for remote entities yet (I-255). Legacy entries keep
        /// reading it as "attacking".
        /// </summary>
        public void UpdateAnimation(Vector3 velocity)
        {
            if (_animController.IsCombatMapped)
            {
                _animController.InCombat = _isAttacking;
                _animController.Update(Alive, velocity);
                return;
            }
            _animController.Update(Alive, velocity, _isAttacking);
        }

        /// <summary>Server GameEvent.Hit landed on this entity. Plays hit on combat-mapped entries only.</summary>
        public void NotifyHit()
        {
            if (_animController.IsCombatMapped)
                _animController.Hit();
        }
```

`VerticalSliceRoot.cs`, outgoing-hit branch, immediately after the `TryGetEntityView … continue;` guard and before the distance filter:

```csharp
                        hitView.NotifyHit(); // F-174: hit clip on combat-mapped entries (no-op otherwise)
```

Scope, said plainly: this branch is `ev.SourceId == myWireId` (`VerticalSliceRoot.cs:1552`), so the hit clip plays **only on entities the local player strikes**. Hits that other players or monsters deal, including hits on the local player, are not wired in slice 1. The wiki text (Task 10) says exactly that.

**Step 3: run → PASS**, plus, through `scripts/godot-verify.sh`: `ATLAS_VERIFY_ANIM '^\[AnimationVerify\] RESULT: PASS'`, `ATLAS_VERIFY_ENTITYVIEW '^\[EntityViewVerify\] RESULT: PASS'` (`EntityViewVerify.cs:80`) and `ATLAS_VERIFY_VERTICAL_SLICE '^\[VerticalSliceProbe\] RESULT: PASS'` (`VerifyVerticalSliceProbe.cs:33`; widen the script's echo filter to `^\[[A-Za-z]+(Verify|Probe)\]` so its lines print).

**Step 4: commit** `feat(client): wire target_id stance and GameEvent.Hit to combat-mapped entities (F-174)`.

**Phase gate (end of Wave B):** all four probes PASS. Wave B review: `code-reviewer` (C#) over Tasks 4-7, focusing on the legacy-path blast radius (every non-`combat_idle` entry must take the old branch), one-shot end detection, and frame-dependent probe flakiness.

---

## Task 8: Gate 1 path-gated section

**Files:**
- Modify: `scripts/precheck.sh`: a selector flag next to `--print-rust-selector` (lines 179-183), a function block after `atlas_web_tests`, `GROUP_ORDER` (line 616), a new `GROUP_godot`, `SERIAL_PLAN` (lines 645-662), the header comment
- Create: `scripts/tests/precheck-pipeline-char.test.mjs`

**Interfaces:**
- Produces: `scripts/precheck.sh --print-pipeline-char-selector` (reads paths on stdin, prints `RUN`/`SKIP`); function `studio_pull_required`; section `"pipeline char: manifest clips + asset-forge + Godot probes (F-174)|pipeline_char_section"` in group `godot`. **Cold cache + unreachable Asset Studio = FAIL. `ATLAS_SKIP_STUDIO=1` while precheck runs = FAIL `studio skip not allowed in Gate 1`** (rev 3, binding: Asset Studio runs on this machine). The section never reports SKIP for the studio; it can only SKIP when no relevant path changed. Only `ci.yml` uses the skip, with a visible `::warning::` line.

**Step 1: failing test**

```js test:scripts/tests/precheck-pipeline-char.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function testPlan(entry) {
  const plan = join(mkdtempSync(join(tmpdir(), "pc-plan-")), "plan.sh");
  writeFileSync(plan, `GROUP_ORDER="godot"\nGROUP_godot=("${entry}")\nSERIAL_PLAN=("${entry}")\n`);
  return plan;
}
function gate(plan, extra = {}) {
  return spawnSync("bash", [join(ROOT, "scripts/precheck.sh"), "--no-install"], {
    cwd: ROOT, encoding: "utf8", timeout: 60000,
    env: {
      ...process.env, ATLAS_PRECHECK_TEST_MODE: "1", ATLAS_PRECHECK_TEST_PLAN: plan, PRECHECK_FULL: "1",
      STUDIO_TOKEN: "t", ATLAS_STUDIO_URL: "http://127.0.0.1:9",
      ATLAS_STUDIO_CACHE_DIR: mkdtempSync(join(tmpdir(), "pc-cache-")), ATLAS_SKIP_STUDIO: "", ...extra,
    },
  });
}
function select(paths) {
  const r = spawnSync("bash", [join(ROOT, "scripts/precheck.sh"), "--print-pipeline-char-selector"], {
    cwd: ROOT, input: `${paths.join("\n")}\n`, encoding: "utf8", timeout: 10000,
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout.trim();
}

test("runs for game-client, asset-forge, the gate's own files, its tests, fixtures and ledgers", () => {
  for (const p of [
    "game-client/assets/manifest.json", "game-client/src/World/AnimationController.cs", "game-client/export_presets.cfg",
    "atelier/asset-forge/validate.mjs", "atelier/asset-forge/tests/studio-report.fixture.json",
    "scripts/check_asset_manifest.mjs", "scripts/bake_thumbnails.mjs",
    "scripts/lib/anim-clips.mjs", "scripts/godot-verify.sh", "scripts/precheck.sh",
    "scripts/studio-pull.mjs", "scripts/lib/studio-pull.mjs", "scripts/lib/studio-token.mjs",
    "scripts/lib/pull-entry.mjs", "scripts/lib/license-policy.mjs",
    "scripts/tests/studio-pull.test.mjs", "scripts/tests/pull-entry.test.mjs", "scripts/tests/godot-verify.test.mjs",
    "scripts/tests/anim-clips.test.mjs", "scripts/tests/precheck-pipeline-char.test.mjs",
    "scripts/tests/bake-thumbnails-pull.test.mjs",
    "scripts/tests/fixtures/studio/sergeant-asset-record.json", "scripts/tests/fixtures/studio/pull-manifest.json",
    ".gitignore", ".github/workflows/ci.yml", "content/asset-taxonomy.json", "art-source/LICENSES.md",
  ]) assert.equal(select([p]), "RUN", p);
});

test("skips unrelated paths", () => {
  assert.equal(select(["docs/x.md", "server-rs/src/main.rs", "atelier/art-forge/a.mjs", "nakama/src/x.ts"]), "SKIP");
});

test("cold cache + unreachable studio: the studio step FAILS loudly (exit 1)", () => {
  const r = gate(testPlan("studio|studio_pull_required"));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /Asset Studio unreachable and the cache is cold/);
  assert.match(r.stdout, /Gate 1 never skips pull-only checks/);
});

test("ATLAS_SKIP_STUDIO=1 in local Gate 1 FAILS the section (exit 1), it never turns into SKIP", () => {
  const r = gate(testPlan("pipeline char|pipeline_char_section"), { ATLAS_SKIP_STUDIO: "1" });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /studio skip not allowed in Gate 1/);
  assert.match(r.stdout, /pipeline char — FAIL/);
  assert.doesNotMatch(r.stdout, /pipeline char — (PASS|SKIP)/);
});

test("ci.yml: the manifest-gate step sets ATLAS_SKIP_STUDIO=1 and prints a visible ::warning:: line", () => {
  const y = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const start = y.indexOf("- name: Asset manifest drift-gate");
  const end = y.indexOf("node scripts/check_asset_manifest.mjs", start);
  assert.ok(start >= 0 && end > start, "manifest-gate step not found");
  const step = y.slice(start, end);
  assert.match(step, /ATLAS_SKIP_STUDIO: "1"/);
  assert.match(step, /echo "::warning[^"]*::[^"]*NOT verified/);
});

test("the section is in the serial plan and exactly one group", () => {
  const r = spawnSync("bash", [join(ROOT, "scripts/precheck.sh"), "--print-plan"], { cwd: ROOT, encoding: "utf8", timeout: 10000 });
  const rows = r.stdout.split("\n").filter((l) => l.includes("pipeline_char_section"));
  assert.equal(rows.filter((l) => l.startsWith("serial\t")).length, 1, r.stdout);
  assert.equal(rows.filter((l) => l.startsWith("godot\t")).length, 1, r.stdout);
});
```

(`--print-plan` is the real flag, `precheck.sh:206`; it prints `serial\t<entry>` and `<group>\t<entry>` rows.)

Verify-Cmd: `cd $WT && node --test scripts/tests/precheck-pipeline-char.test.mjs scripts/tests/precheck-groups.test.mjs`

Expected FAIL: `select()` asserts exit 0, and precheck answers the new flag with `❌ unknown flag: --print-pipeline-char-selector (see --help)` and **exit 2** (`precheck.sh:211`); the studio tests fail on the missing function/section; the ci.yml test fails on the missing `env:`/`::warning::`; the plan test finds 0 rows.

**Step 2: minimal implementation** (`scripts/precheck.sh`)

Selector flag (after `--print-rust-selector`), plus the shared regex defined above it:

```bash
# F-174: the pipeline-character section runs only when one of these paths changed.
PIPELINE_CHAR_PATHS='^(game-client/|atelier/asset-forge/|\.gitignore$|\.github/workflows/ci\.yml$|content/asset-taxonomy\.json$|art-source/LICENSES\.md$|scripts/check_asset_manifest\.mjs$|scripts/bake_thumbnails\.mjs$|scripts/lib/(anim-clips|pull-entry|studio-pull|studio-token|license-policy)\.mjs$|scripts/studio-pull\.mjs$|scripts/godot-verify\.sh$|scripts/precheck\.sh$|scripts/tests/(studio-pull|pull-entry|godot-verify|anim-clips|precheck-pipeline-char|bake-thumbnails-pull)\.test\.mjs$|scripts/tests/fixtures/studio/)'
if [ "${1:-}" = "--print-pipeline-char-selector" ]; then
  paths=$(cat) || exit 1
  if grep -qE "$PIPELINE_CHAR_PATHS" <<<"$paths"; then echo RUN; else echo SKIP; fi
  exit 0
fi
```

Section (after `atlas_web_tests`):

```bash
# F-174 pull-only assets: fill game-client/studio-cache/ from Asset Studio (sha256-verified).
# Asset Studio runs on this machine, so Gate 1 never skips: a cold cache with the studio
# unreachable FAILS, a refused token (studio auth failed) FAILS, a sha mismatch FAILS.
studio_pull_required() {
  node "$REPO_ROOT/scripts/studio-pull.mjs"; local rc=$?
  [ "$rc" -eq 0 ] && return 0
  [ "$rc" -eq 2 ] && echo "❌ Asset Studio unreachable and the cache is cold. Start Asset Studio or set STUDIO_TOKEN; Gate 1 never skips pull-only checks."
  return 1
}

# F-174: manifest clip gate (V), the pull-only rules, the asset-forge suite, and the Godot probes
# on the pinned mono build. Requires the "[PipelineCharVerify] VERDICT PASS" line; an exit code
# alone is never accepted (PATH godot exits 0 on C# failure). Fails closed if the mono build is absent.
pipeline_char_section() {
  # Binding (F-174 rev 3): only ci.yml may skip the studio, and it says so with ::warning::.
  # Checked before the path gate, so a stray export can never ride along on any run.
  if [ "${ATLAS_SKIP_STUDIO:-}" = "1" ]; then
    echo "❌ studio skip not allowed in Gate 1 (unset ATLAS_SKIP_STUDIO; Asset Studio runs on this machine)"
    return 1
  fi
  if [ "${PRECHECK_FULL:-0}" != "1" ]; then
    local changed
    if changed=$(changed_paths) && ! grep -qE "$PIPELINE_CHAR_PATHS" <<<"$changed"; then
      SKIP_REASON="no game-client/, asset-forge or manifest-gate path changed; PRECHECK_FULL=1 to force"
      return "$SKIP_RC"
    fi
  fi
  studio_pull_required || return 1
  node "$REPO_ROOT/scripts/check_asset_manifest.mjs" || return 1
  ( cd "$REPO_ROOT" && node --test scripts/tests/anim-clips.test.mjs scripts/tests/godot-verify.test.mjs \
      scripts/tests/precheck-pipeline-char.test.mjs scripts/tests/studio-pull.test.mjs scripts/tests/pull-entry.test.mjs \
      scripts/tests/bake-thumbnails-pull.test.mjs ) || return 1
  ( cd "$REPO_ROOT/atelier/asset-forge" && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && npm test ) || return 1
  "$REPO_ROOT/scripts/godot-verify.sh" ATLAS_VERIFY_ANIM '^\[AnimationVerify\] RESULT: PASS' || return 1
  "$REPO_ROOT/scripts/godot-verify.sh" ATLAS_VERIFY_PIPELINE_CHAR '^\[PipelineCharVerify\] VERDICT PASS$'
}
```

Plan registration: `GROUP_ORDER="ts rust node explorer py godot"`, and

```bash
GROUP_godot=(
  "pipeline char: manifest clips + asset-forge + Godot probes (F-174)|pipeline_char_section"
)
```

and the same entry appended to `SERIAL_PLAN`. Note in the group-rationale comment: the godot group writes only `game-client/.godot` and `game-client/.godot/mono` build output, which no other group reads.

**Step 3: run → PASS** (Verify-Cmd; also run `scripts/tests/precheck-parallel.test.mjs` and `scripts/tests/precheck-fail-closed.test.mjs`, which may pin the group list, and update them only if they assert the old `GROUP_ORDER` string).

**Step 4: proven red through the real section** (test-mode seam, so only this section runs):

```bash
cd $WT && P=$(mktemp) && cat > "$P" <<'EOF'
GROUP_ORDER="godot"
GROUP_godot=("pipeline char|pipeline_char_section")
SERIAL_PLAN=("pipeline char|pipeline_char_section")
EOF
sed -i '' 's/"block_idle"/"block_idle_RENAMED"/' game-client/assets/manifest.json
ATLAS_PRECHECK_TEST_MODE=1 ATLAS_PRECHECK_TEST_PLAN="$P" PRECHECK_FULL=1 ./scripts/precheck.sh --no-install; echo "exit=$?"
git checkout HEAD -- game-client/assets/manifest.json && git diff --exit-code HEAD -- game-client/assets/manifest.json
ATLAS_PRECHECK_TEST_MODE=1 ATLAS_PRECHECK_TEST_PLAN="$P" PRECHECK_FULL=1 ./scripts/precheck.sh --no-install; echo "exit=$?"
```

Expected: first run `❌ pipeline char — FAIL`, `RESULT: TEST MODE FAILURES`, `exit=1`; second run `✅ pipeline char — PASS`, `RESULT: TEST MODE PASS`, `exit=3`. Then repeat the red run with `ATLAS_GODOT_MONO=/usr/local/bin/godot` (non-mono) → FAIL "not a mono build". Then run the cold-cache case for real: `ATLAS_STUDIO_CACHE_DIR=$(mktemp -d) ATLAS_STUDIO_URL=http://127.0.0.1:9` → `❌ Asset Studio unreachable…`, exit=1. The same command with `ATLAS_SKIP_STUDIO=1` → `❌ studio skip not allowed in Gate 1`, `❌ pipeline char — FAIL`, exit=1. Record both in the task report. Gate 1 can only pass with the studio verified, so the ship report states the studio-pull line (`cached` or `pulled`).

**Step 5: full Gate 1 green:** `./scripts/precheck.sh --no-install`, with Asset Studio up (`ATLAS_SKIP_STUDIO` unset; setting it fails the section). The new section shows `PASS` (it runs, because this branch changes `game-client/`), then `RESULT: GATE 1 PASS`. Record the section's `[gate-timing]` seconds for the D3 note.

**Step 6: README.** Repo `README.md` probe section: "Gate 1 runs these when game-client/, atelier/asset-forge/ or the manifest gate changes; `ATLAS_GODOT_MONO` overrides the binary". Header comment of `scripts/precheck.sh`: one paragraph like SELECTIVE RUST.

**Step 7: commit** `feat(gate1): path-gated pipeline-character section on pinned mono Godot (F-174)`.

**Phase gate:** full Gate 1 green; red runs captured in the task report.

---

## Task 9: Render strip (windowed, `--write-movie`)

**Files:**
- Create: `game-client/src/World/PipelineStripRender.cs`
- Modify: `game-client/src/VerticalSliceRoot.cs` (next to the Task 4 hook)
- Modify: `scripts/atlas_world_web/static_mounts.py` (`MOUNT_DIRS` += `"game-client/studio-cache/renders"`), `scripts/check_atlas_web_image.py` (`ABSENT_MOUNTS` += the same path, the `atelier/art-forge/out` precedent: gitignored, so the image never holds it)
- Artifact (gitignored, **never committed**): `game-client/studio-cache/renders/<SERGEANT_SHA>.strip.png`. It is a render of a private asset, and the repo is public.

**Interfaces:**
- Produces: env `ATLAS_RENDER_PIPELINE_STRIP=<absolute png path>`; output 9 cells × 320 px wide, 480 px tall (2880×480), in this frame order: idle, walk, run, combat_idle, attack, block, hit, death, attack + axe. The node prints `[PipelineStripRender] WROTE <path> 2880x480` and exits 0, or prints `[PipelineStripRender] FAIL …` and exits 1. The character renders in a `SubViewport` with its **own `World3D`** and a neutral background, so nothing from the VerticalSlice scene can enter a cell. Each cell must change **≥ 3 %** of its pixels against a no-character reference frame of the same stage. Test seam: `ATLAS_STRIP_NO_CHARACTER=1` renders an empty `Node3D` in place of the sergeant, so every cell must FAIL. **Before any frame** (rev 3) the node resolves the key once, prints `[PipelineStripRender] resolved npc:lantern_hollow_watch_sergeant -> <scene path> (tier <tier>)`, and exits 1 with `[PipelineStripRender] FAIL resolved to <tier>, not Bespoke …` unless the tier is `ResolveTier.Bespoke`. A capsule fallback (no `--import`, cold cache) would otherwise render nine "non-blank" capsule cells.

**Step 1: failing check** (the node self-checks pixels, because a blank strip has passed every byte check before):

Verify-Cmd: `cd $WT && STRIP="$WT/game-client/studio-cache/renders/$SERGEANT_SHA.strip.png" && node scripts/studio-pull.mjs && dotnet build game-client/GameClient.csproj -nologo -v q && timeout "${ATLAS_GODOT_IMPORT_TIMEOUT:-900}" "$GODOT" --headless --path game-client --import >/dev/null 2>&1 && ATLAS_RENDER_PIPELINE_STRIP="$STRIP" timeout 180 "$GODOT" --path game-client --resolution 1280x720 --write-movie "$(mktemp -d)/frame.png" --fixed-fps 30 --quit-after 600 2>&1 | grep PipelineStripRender`

(The pull and the `--import` run first, every time: a windowed run on an un-imported pull resolves the capsule.)

Expected FAIL (before implementation): no `[PipelineStripRender]` line; the normal game boots and `--quit-after 600` / `timeout 180` end it.

**Step 2: implementation** `PipelineStripRender.cs`:

```csharp
using System.Threading.Tasks;
using Godot;
using AtlasWorld.Client.Content;

namespace AtlasWorld.Client.World
{
    /// <summary>
    /// F-174 review artifact: one frame per combat state plus one with the axe swapped in,
    /// composed into a single PNG. Needs a WINDOWED run (headless has no pixels):
    ///   ATLAS_RENDER_PIPELINE_STRIP=/abs/out.png Godot --path game-client --resolution 1280x720 \
    ///     --write-movie /tmp/x/frame.png --fixed-fps 30 --quit-after 600
    /// The character renders in a SubViewport with its OWN World3D (neutral background, own camera
    /// and light), so the VerticalSlice scene's terrain and props can never fill a cell. Each cell
    /// must change >= 3% of its pixels against a no-character reference frame, or it exits 1.
    /// ATLAS_STRIP_NO_CHARACTER=1 renders an empty node instead (test seam: every cell must FAIL).
    /// The output is a render of a private Asset Studio asset: write it under the gitignored
    /// game-client/studio-cache/renders/, never into a tracked path.
    /// </summary>
    public sealed partial class PipelineStripRender : Node
    {
        private const int CellW = 320;
        private const int CellH = 480;
        private const double MinChanged = 0.03;
        private static readonly Color Bg = new(0.16f, 0.17f, 0.20f);
        private static readonly (string State, bool Axe)[] Frames =
        {
            ("idle", false), ("walk", false), ("run", false), ("combat_idle", false),
            ("attack", false), ("block", false), ("hit", false), ("death", false), ("attack", true),
        };

        public override async void _Ready()
        {
            string outPath = OS.GetEnvironment("ATLAS_RENDER_PIPELINE_STRIP");
            bool noCharacter = OS.GetEnvironment("ATLAS_STRIP_NO_CHARACTER") == "1";
            AssetRegistry reg = AssetRegistry.Instance!;

            var vp = new SubViewport
            {
                Size = new Vector2I(CellW, CellH), OwnWorld3D = true, TransparentBg = false,
                RenderTargetUpdateMode = SubViewport.UpdateMode.Always,
            };
            AddChild(vp);
            var stage = new Node3D { Name = "Stage" };
            vp.AddChild(stage);
            var cam = new Camera3D { Position = new Vector3(0f, 0.62f, 2.0f), Fov = 40f, Current = true };
            stage.AddChild(cam);
            cam.LookAt(new Vector3(0f, 0.55f, 0f));
            stage.AddChild(new DirectionalLight3D { RotationDegrees = new Vector3(-40f, 25f, 0f) });
            stage.AddChild(new WorldEnvironment
            {
                Environment = new Godot.Environment
                {
                    BackgroundMode = Godot.Environment.BGMode.Color, BackgroundColor = Bg,
                    AmbientLightSource = Godot.Environment.AmbientSource.Color,
                    AmbientLightColor = new Color(0.65f, 0.65f, 0.7f),
                },
            });
            // Resolve once, before any frame: a capsule fallback (cold cache, no --import) would
            // render nine "non-blank" cells of the wrong thing.
            PackedScene sergeant = reg.Resolve(PipelineCharVerify.Key, out ResolveTier tier);
            GD.Print($"[PipelineStripRender] resolved {PipelineCharVerify.Key} -> {(string.IsNullOrEmpty(sergeant.ResourcePath) ? "<procedural capsule>" : sergeant.ResourcePath)} (tier {tier})");
            if (!noCharacter && tier != ResolveTier.Bespoke)
            {
                GD.Print($"[PipelineStripRender] FAIL resolved to {tier}, not Bespoke — run node scripts/studio-pull.mjs and godot --headless --import first");
                GetTree().Quit(1);
                return;
            }
            PackedScene axe = ResourceLoader.Load<PackedScene>("res://assets/weapons/axe.glb");
            Image empty = await Capture(vp); // the same stage with no character: the reference
            Image strip = Image.CreateEmpty(CellW * Frames.Length, CellH, false, Image.Format.Rgba8);
            int blank = 0;

            for (int i = 0; i < Frames.Length; i++)
            {
                (string state, bool withAxe) = Frames[i];
                string label = state + (withAxe ? "+axe" : "");
                Node3D root;
                if (noCharacter)
                {
                    root = new Node3D();
                    stage.AddChild(root);
                }
                else
                {
                    root = (Node3D)sergeant.Instantiate();
                    stage.AddChild(root);
                    var anim = new AnimationController(root, reg.ResolveAnimOverrides(PipelineCharVerify.Key),
                        reg.ResolveAnimVariants(PipelineCharVerify.Key));
                    if (withAxe)
                        new WeaponSocket(root).Equip(axe);
                    Drive(anim, state);
                    AnimationPlayer player = FindPlayer(root)!;
                    player.Seek(player.CurrentAnimationLength * (state == "death" ? 0.98 : 0.4), true);
                    player.Pause();
                }

                Image shot = await Capture(vp);
                strip.BlitRect(shot, new Rect2I(0, 0, CellW, CellH), new Vector2I(i * CellW, 0));
                double changed = ChangedShare(empty, shot);
                if (changed < MinChanged)
                {
                    GD.Print($"[PipelineStripRender] FAIL cell {i} ({label}) changed {changed:P1} of pixels vs the empty frame (< 3%)");
                    blank++;
                }
                else
                {
                    GD.Print($"[PipelineStripRender] cell {i} ({label}) changed {changed:P1}");
                }
                root.QueueFree();
                await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
            }

            DirAccess.MakeDirRecursiveAbsolute(outPath.GetBaseDir());
            Error err = blank == 0 ? strip.SavePng(outPath) : Error.Failed;
            GD.Print(err == Error.Ok
                ? $"[PipelineStripRender] WROTE {outPath} {strip.GetWidth()}x{strip.GetHeight()}"
                : $"[PipelineStripRender] FAIL save={err} blank={blank}");
            GetTree().Quit(err == Error.Ok ? 0 : 1);
        }

        private async Task<Image> Capture(SubViewport vp)
        {
            for (int f = 0; f < 3; f++)
                await ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);
            Image img = vp.GetTexture().GetImage();
            img.Convert(Image.Format.Rgba8);
            return img;
        }

        /// <summary>Share of sampled pixels that differ between two same-size frames.</summary>
        private static double ChangedShare(Image reference, Image shot)
        {
            int changed = 0, total = 0;
            for (int y = 0; y < CellH; y += 2)
            for (int x = 0; x < CellW; x += 2)
            {
                Color p = reference.GetPixel(x, y), q = shot.GetPixel(x, y);
                total++;
                if (Mathf.Abs(p.R - q.R) + Mathf.Abs(p.G - q.G) + Mathf.Abs(p.B - q.B) > 0.1f)
                    changed++;
            }
            return (double)changed / total;
        }

        private static void Drive(AnimationController anim, string state)
        {
            switch (state)
            {
                case "walk": anim.Update(true, new Vector3(1.5f, 0f, 0f)); break;
                case "run": anim.Update(true, new Vector3(12f, 0f, 0f)); break;
                case "combat_idle": anim.InCombat = true; anim.Update(true, Vector3.Zero); break;
                case "attack": anim.InCombat = true; anim.Attack(); anim.Update(true, Vector3.Zero); break;
                case "block": anim.InCombat = true; anim.Block(true); anim.Update(true, Vector3.Zero); break;
                case "hit": anim.InCombat = true; anim.Hit(); anim.Update(true, Vector3.Zero); break;
                case "death": anim.Update(false, Vector3.Zero); break;
                default: anim.Update(true, Vector3.Zero); break;
            }
        }

        private static AnimationPlayer? FindPlayer(Node n)
        {
            if (n is AnimationPlayer p)
                return p;
            foreach (Node c in n.GetChildren())
                if (FindPlayer(c) is AnimationPlayer hit)
                    return hit;
            return null;
        }
    }
}
```

Hook in `VerticalSliceRoot.cs` (beside the Task 4 hook):

```csharp
            if (!string.IsNullOrEmpty(OS.GetEnvironment("ATLAS_RENDER_PIPELINE_STRIP")))
            {
                SetProcess(false);
                SetPhysicsProcess(false);
                SetProcessInput(false);
                SetProcessUnhandledInput(false);
                AddChild(new PipelineStripRender { Name = "PipelineStripRender" });
                return;
            }
```

**Step 3: run → PASS** (Verify-Cmd prints `resolved npc:lantern_hollow_watch_sergeant -> res://studio-cache/7f1c54c3….glb (tier Bespoke)` first, then nine `cell i (…) changed N%` lines, each ≥ 3 %, and `WROTE … 2880x480`). **Proven red, capsule:** move the cache glb **and** its `.import` aside (`for f in "$SRC_GLB" "$SRC_GLB.import"; do mv "$f" "$f.off"; done`; the `.import` remap alone would still load the imported copy from `.godot/imported`), run only the windowed command (no pull, no import) → `resolved … -> <procedural capsule> (tier Capsule)`, `FAIL resolved to Capsule, not Bespoke`, exit 1; then `for f in "$SRC_GLB" "$SRC_GLB.import"; do mv "$f.off" "$f"; done` and re-run the full Verify-Cmd green. (The cache is gitignored, so the move touches no tracked file.) **Proven red:** the same command with `ATLAS_STRIP_NO_CHARACTER=1` prints nine `FAIL cell …` lines and `FAIL save=Failed blank=9`, and exits 1. That shows the check cannot pass on the stage alone. Check the dimensions with `node -e 'const b=require("fs").readFileSync(process.argv[1]);console.log(b.subarray(1,4).toString(),b.readUInt32BE(16),b.readUInt32BE(20))' "$STRIP"` → `PNG 2880 480`. Then `git status --porcelain` lists nothing under `game-client/studio-cache/`. **Look at the pixels:** `Read` the PNG (the downscale hook caps it at 1024 px) and confirm by eye that each cell shows the sergeant in the named pose, that the axe is in the hand in cell 9, and that nothing is cropped. The stage is the node's own world, so if a shot is off, fix the camera or light in this node.

**Step 4: README.** Repo `README.md` probe section: the exact strip command, plus "windowed only (`--headless` has no pixels)".

Serve it for review: after the `static_mounts.py` and `check_atlas_web_image.py` edits, `curl -sL -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:8788/game-client/studio-cache/renders/$SERGEANT_SHA.strip.png` → `200 image/png` on the edit host (which reads the worktree's disk). `python3 scripts/check_atlas_web_image.py` stays green on a checkout without the cache (the path is in `ABSENT_MOUNTS`).

**Step 5: commit** `feat(client): sergeant render strip for review (F-174)` (cs, hook, `static_mounts.py`, `check_atlas_web_image.py`). The PNG is **not** committed.

**Phase gate (end of Wave C):** strip written and viewed; the no-character run shown red; Gate 1 still green. Wave C review: `code-reviewer` over Tasks 8-9 (gate fail-closed paths, the selector regex, the refused `ATLAS_SKIP_STUDIO` path, the tier check, and `git ls-files game-client/studio-cache` → empty).

---

## Task 10: Game Systems wiki page in the lore panel (UI)

**Files:**
- Create: `content/studio/game-systems.json`
- Modify: `atelier/atlas-world-panels/js/lore-model.mjs`: `CHAPTERS` (lines 162-170), `buildLoreModel` empty return (lines 183-192), input destructure (line 195), final return (lines 487-504)
- Modify: `atelier/atlas-world-panels/js/panels/lore.mjs`: URL consts (lines 11-18), `chapterForRef` (lines 85-100), `renderLorePage` (lines 646-680), `mount` fetch (lines 712-740), a new `buildSystemsSection`
- Modify: `atelier/atlas-world-panels/css/panels.css` (strip frame only, reusing tokens)
- Test: `atelier/atlas-world-panels/tests/lore.test.mjs` (append)
- Modify: `atelier/atlas-world-panels/README.md` (panels table row)

**Interfaces:**
- Produces: `CHAPTERS` gains `{ id: "systems", label: "Game Systems", icon: "🛡️", anchor: "lore-chapter-systems" }` (last); `buildLoreModel({…, gameSystems})` returns `systems: Array<{id, title, summary, sections: {heading, body}[], strip: {src, alt, frames: string[]} | null, limits: string[], featureId}>` and `stats.systemCount`; `chapterForRef("system-…") === "systems"`. Deep link: `?tab=lore&chapter=systems&ref=system-combat-stances`.

**Step 0 (UI gate entry):** read `design-brief.md` (Task 0). Run `impeccable` craft on this section. The gate at the end needs `critique.md` beside the plan, plus `ui-visual-verify` shots.

**Step 1: failing test**

```js test:atelier/atlas-world-panels/tests/lore.test.mjs
// --- F-174 Game Systems chapter ----------------------------------------------
const gameSystems = readJson("content/studio/game-systems.json");

test("Game Systems: chapter exists, is last, and refs route to it", async () => {
  assert.equal(CHAPTERS.at(-1).id, "systems");
  const { chapterForRef } = await import("../js/panels/lore-refs.mjs");
  assert.equal(chapterForRef("system-combat-stances"), "systems");
  assert.equal(chapterForRef("god-x"), "gods");
});

test("Game Systems: F-174 page is built from content/studio/game-systems.json", () => {
  const model = buildLoreModel({ worldHistory, atlas, continents, conceptArtIndex, gameSystems });
  const page = model.systems.find((s) => s.id === "system-combat-stances");
  assert.ok(page, "combat stances page missing");
  assert.equal(page.featureId, "F-174");
  assert.ok(page.sections.length >= 3);
  assert.equal(page.strip.frames.length, 9);
  assert.equal(model.stats.systemCount, model.systems.length);
});

test("Game Systems: the strip points into the gitignored render cache and carries a fallback for builds without it", () => {
  const page = gameSystems.systems.find((s) => s.id === "system-combat-stances");
  // Pull-only (F-174): the strip renders a private asset and is never committed, so the release
  // image (git archive) never has it. The page must say where to see it instead of a broken image.
  assert.match(page.strip.src, /^\/game-client\/studio-cache\/renders\/[0-9a-f]{64}\.strip\.png$/);
  assert.match(page.strip.fallback, /atlas-edit\.joymify\.local\.com\/\?tab=lore&chapter=systems&ref=system-combat-stances/);
  const model = buildLoreModel({ worldHistory, atlas, continents, conceptArtIndex, gameSystems });
  assert.equal(model.systems.find((s) => s.id === page.id).strip.fallback, page.strip.fallback);
});

test("Game Systems: absent input degrades to an empty chapter, never throws", () => {
  const model = buildLoreModel({ worldHistory, atlas, continents, conceptArtIndex });
  assert.deepEqual(model.systems, []);
  assert.equal(buildLoreModel(null).systems.length, 0);
});
```

`chapterForRef` lives inside `lore.mjs` today, and that file calls `register()` and touches `window`, so a test cannot import it. Move `chapterForRef` into a new pure module `atelier/atlas-world-panels/js/panels/lore-refs.mjs`, export it, and import it from `lore.mjs`. That keeps the test DOM-free.

The existing "NO undefined" and "NO renamed-away name" tests also run over the new model. Write the page text against `name-map.json` so they stay green.

Verify-Cmd: `cd $WT && node --test atelier/atlas-world-panels/tests/lore.test.mjs`

Expected FAIL: `ENOENT … content/studio/game-systems.json` at module load.

**Step 2: implementation**

`content/studio/game-systems.json` (friendly, player-facing text):

```json
{
  "version": 1,
  "systems": [
    {
      "id": "system-combat-stances",
      "featureId": "F-174",
      "title": "Combat stances and weapon swap",
      "summary": "Characters drop into a guard stance when they pick a target, swing in a rotating set of attacks, flinch when struck, and can change the weapon in their hand without a new model.",
      "sections": [
        { "heading": "Relaxed and on guard", "body": "Out of a fight a character stands, walks and runs in a relaxed way. The moment the server says it has a target, it raises its guard (the combat idle). When the target is gone it relaxes again." },
        { "heading": "Attacks that do not repeat", "body": "A fighter with several attack swings plays them in turn: first, second, third, then back to the first. After each swing it returns to its guard. Swings blend in softly over 0.15 seconds." },
        { "heading": "Blocking and being hit", "body": "A block holds the shield up for as long as it lasts. A hit from the server plays a short flinch, then the character goes back to guard, or to standing if it is no longer fighting. A fallen character stays down on its last frame." },
        { "heading": "Swapping the weapon", "body": "The weapon sits on a hand socket, apart from the body. The game can take the baked weapon off and put another one on, for example an axe, while every animation keeps working." }
      ],
      "limits": [
        "The server does not yet send attack or block for other players and monsters (I-255). Today the flinch plays only on monsters and characters that your own character hits; hits that others deal, including hits on you, show no flinch yet.",
        "A swapped weapon is held by its own origin until weapons carry a grip point, so some weapons may sit slightly off in the hand.",
        "The shield stays part of the body for now."
      ],
      "strip": {
        "src": "/game-client/studio-cache/renders/7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f.strip.png",
        "fallback": "This picture is a private render and is not part of this build. See it on the edit host: http://atlas-edit.joymify.local.com/?tab=lore&chapter=systems&ref=system-combat-stances",
        "alt": "The Lantern Hollow watch sergeant in nine poses: idle, walk, run, guard, attack, block, hit, fallen, and attack holding a swapped-in axe.",
        "frames": ["Idle", "Walk", "Run", "Guard", "Attack", "Block", "Hit", "Fallen", "Attack + axe"]
      }
    }
  ]
}
```

`lore-model.mjs`: append the `systems` chapter to `CHAPTERS`; add `systems: []` and `systemCount: 0` to the empty return; destructure `gameSystems = null`; build

```js
  const systems = (Array.isArray(gameSystems?.systems) ? gameSystems.systems : [])
    .filter((s) => s && typeof s.id === "string" && typeof s.title === "string")
    .map((s) => ({
      id: s.id,
      featureId: s.featureId ?? "",
      title: applyNameMap(s.title),
      summary: applyNameMap(s.summary ?? ""),
      sections: (s.sections ?? []).map((x) => ({ heading: applyNameMap(x.heading ?? ""), body: applyNameMap(x.body ?? "") })),
      limits: (s.limits ?? []).map((l) => applyNameMap(l)),
      strip: s.strip && typeof s.strip.src === "string"
        ? { src: s.strip.src, alt: s.strip.alt ?? "", fallback: s.strip.fallback ?? "", frames: Array.isArray(s.strip.frames) ? s.strip.frames : [] }
        : null,
    }));
```

and return `systems` plus `systemCount: systems.length`. (`applyNameMap(text)` takes one argument, `lore-model.mjs:88`.)

`lore-refs.mjs`: the moved `chapterForRef`, plus `if (ref.startsWith("system-")) return "systems";` before the fallback.

`lore.mjs`: `const GAME_SYSTEMS_URL = "/content/studio/game-systems.json";`. In `mount`, fetch it inside its own try (like concept art). A failure sets `gameSystems = { systems: [] }` and `systemsError = true`, so the World Bible still renders. Pass `gameSystems` to `buildLoreModel`. Add `container.appendChild(buildSystemsSection(m.systems, systemsError));` after mysteries.

```js
function buildSystemsSection(systems, failed) {
  const section = el("section", "lore-chapter");
  section.id = "lore-chapter-systems";
  section.appendChild(el("h2", "lore-chapter-title", "🛡️ Game Systems"));
  if (failed || systems.length === 0) {
    section.appendChild(el("p", "lore-chapter-desc", failed
      ? "Game systems archive unavailable — the rest of the World Bible is unaffected."
      : "No game systems are documented yet."));
    return section;
  }
  for (const s of systems) {
    const card = el("article", "lore-card lore-system");
    card.id = `lore-ref-${s.id}`;
    card.appendChild(el("h3", "lore-card-title", s.title));
    card.appendChild(el("p", "lore-card-body", s.summary));
    if (s.strip) {
      const frame = el("figure", "lore-strip");
      const img = el("img");
      img.src = s.strip.src; img.alt = s.strip.alt; img.loading = "lazy";
      // Pull-only render: absent from the release image by design. Swap in the note, never a broken image.
      img.addEventListener("error", () => frame.replaceChildren(el("p", "lore-chapter-desc", s.strip.fallback)), { once: true });
      frame.appendChild(img);
      const caps = el("figcaption", "lore-strip-caps");
      for (const f of s.strip.frames) caps.appendChild(el("span", "", f));
      frame.appendChild(caps);
      card.appendChild(frame);
    }
    for (const x of s.sections) {
      card.appendChild(el("h4", "lore-card-subtitle", x.heading));
      card.appendChild(el("p", "", x.body));
    }
    if (s.limits.length) {
      const box = el("aside", "lore-card lore-card--highlight");
      box.appendChild(el("strong", "", "Known limits"));
      const ul = el("ul");
      for (const l of s.limits) ul.appendChild(el("li", "", l));
      box.appendChild(ul);
      card.appendChild(box);
    }
    section.appendChild(card);
  }
  return section;
}
```

The class names above must be the ones the other chapters use (`lore.mjs` today: `lore-chapter`, `lore-chapter-header`, `lore-chapter-title`, `lore-chapter-desc`, `lore-card`, `lore-card--highlight`, `lore-card-title`, `lore-card-subtitle`, `lore-card-body`). So in `buildSystemsSection` use `lore-chapter-desc` for the empty/error line and `lore-card lore-card--highlight` for the limits box (the code above already does). Only `.lore-strip` / `.lore-strip-caps` are new, using the panel tokens (`--border`, `--text-dim`; there is no `--joy-*` token in `panels.css`), nested under the same `.lore-container` block as `.lore-chapter-desc` (`panels.css:3025`):

```css
.lore-strip { margin: 12px 0; overflow-x: auto; border-radius: 8px; border: 1px solid var(--border); }
.lore-strip img { display: block; height: 240px; width: auto; max-width: none; }
.lore-strip-caps { display: grid; grid-template-columns: repeat(9, 160px); font-size: 12px; color: var(--text-dim); text-align: center; padding: 4px 0; }
```

(The image shows at half scale, 240 px tall and 160 px per cell. The image and its caption row scroll together inside the frame; the page itself never scrolls sideways.)

Stat chip: add `stats.appendChild(statChip(m.stats.systemCount, "Game Systems"));`.

**Step 3: run → PASS** (Verify-Cmd + the whole panels suite `node --test atelier/atlas-world-panels/tests/*.test.mjs`, which includes the panel-parity gate).

**Step 4: look at it (rule 16).** Start the edit host `python3 scripts/catalog_explorer_web.py --port 8788` (background). Then:

```bash
URL='http://127.0.0.1:8788/?tab=lore&chapter=systems&ref=system-combat-stances'
curl -sL -o /dev/null -w '%{http_code} %{url_effective}\n' "$URL"
curl -sL -o /dev/null -w '%{http_code} %{content_type} %{size_download}\n' http://127.0.0.1:8788/game-client/studio-cache/renders/7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f.strip.png
curl -sL http://127.0.0.1:8788/content/studio/game-systems.json | head -c 80
node ~/.claude/skills/ui-visual-verify/shoot.mjs --url "$URL" --name f174-systems
```

Expected: `200 …url…`, `200 image/png <size>` (the same byte size as the file in the cache), JSON text. `Read` the phone (390×844) and desktop (1280×800) shots: the chapter is in view, the strip shows nine readable poses inside its frame, there is no horizontal page scroll, and the header does not wrap. Fix the lint findings, then write `critique.md` (impeccable critique against `design-brief.md`) beside the plan.

**Step 5: README.** `atelier/atlas-world-panels/README.md` panels table: `| panels/lore.mjs | ?tab=lore[&chapter=…&ref=…] | World Bible + Game Systems wiki (content/studio/*.json; F-174 adds game-systems.json) |`.

**Step 6: commit** `feat(wiki): Game Systems chapter with combat stances + weapon swap page (F-174)`.

**Phase gate:** panels suite green; `critique.md` written; ui-visual-verify phone + desktop shots viewed and shown to the user; Wave D review (one consolidated reviewer, R2 UI).

---

## Task 11: Live check on the release app (after ship)

Runs after `psrw ship` (Gate 1 green). Ship runs `scripts/deploy-local.sh`, which rebuilds `deployment/atlas-world-web` from the release commit (`scripts/build-atlas-web-image.sh`, `git archive`). The image holds no studio-cache, by design.

```bash
kubectl config current-context        # must be the local cluster (k8s-safety skill first)
kubectl rollout status deployment/atlas-world-web --timeout=180s
URL='http://atlas-world.joymify.local.com/?tab=lore&chapter=systems&ref=system-combat-stances'
EDIT='http://atlas-edit.joymify.local.com/?tab=lore&chapter=systems&ref=system-combat-stances'
curl -sL -o /dev/null -w '%{http_code} %{url_effective}\n' "$URL"
curl -sL -o /dev/null -w '%{http_code}\n' http://atlas-world.joymify.local.com/game-client/studio-cache/renders/7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f.strip.png   # → 404: the private render is NOT in the release image
curl -sL -o /dev/null -w '%{http_code} %{url_effective}\n' "$EDIT"
curl -sL -o "$TMPDIR/strip.png" -w '%{http_code} %{content_type} %{size_download}\n' \
  http://atlas-edit.joymify.local.com/game-client/studio-cache/renders/7f1c54c3707359dc12d3ed3582be1f60460f19d9fbd01930c49f406e1fbfc75f.strip.png
head -c 4 "$TMPDIR/strip.png" | xxd | head -1        # must show 89504e47 (PNG)
node ~/.claude/skills/ui-visual-verify/shoot.mjs --url "$URL" --name f174-release
node ~/.claude/skills/ui-visual-verify/shoot.mjs --url "$EDIT" --name f174-edit
```

Expected: the release app returns `200` with the same `url_effective` (no port-dropping redirect), and its shots show the chapter text with the **fallback note** in place of the strip. The strip URL there returns `404`, which proves no private bytes ship in the image. The edit host returns `200`, a PNG with the same byte size as the cache file, and shots that show the nine poses. `Read` the phone 390×844 + desktop 1280×800 shots of both, and show them to the user (`show_image`). The review links sent to the owner are `$URL` (wiki page) and `$EDIT` (strip).

If the edit host returns 404 for the strip, the `static_mounts.py` edit from Task 9 is missing on the running host. Restart it from the worktree and re-run.

Commit: none (verification only); paste the outputs into the ship report.

---

## Spec coverage map

| Spec acceptance criterion | Task(s) | Proof |
|---|---|---|
| Mono binary prints `VERDICT PASS`, exit 0; FAIL exits 1 (rename one mapped clip) | 4, 6 (Step 4), 8 | `godot-verify.sh` + manifest rename red run |
| Probe loads the key; each state plays its mapped clip, 3 variants rotate, loop modes, death holds last frame | 4, 5 | `CheckManifest`, `CheckStates` |
| InCombat sequence idle→combat_idle→attack→combat_idle→idle; blend 0.15 sergeant / 0.05 mob | 5, 7 | `CheckStates`, `CheckMobBlend`, `CheckEntityViewWiring` |
| `Equip(axe.glb)`: no `held_shaft_r`, one axe under the hand attachment, >1 cm move, <=1 mm hand offset; `Unequip` → 0 children | 6 | `CheckWeaponSwap` |
| `AnimationVerify` still passes | 4, 5, 7, 8 | ANIM probe in each task + the Gate 1 section |
| `check_asset_manifest.mjs` passes; red on renamed clip and on removed death | 3 | Step 4 mutation runs |
| `validate.mjs --kind pipelineCharacter` passes the sergeant; red on KayKit mob (skeleton) and 16k fixture | 1 | validate tests |
| Intake red on sha256 ≠ the approved sha (offline fixture). Rev 2: the sha is the Asset Studio record's, and the bytes are pulled, never committed | 1a, 2 | `studio-pull.test.mjs` sha-mismatch case, intake studio sha-mismatch case |
| Owner R0: pull, don't commit; licence honest (`studio-private` only on pull-only entries); nothing tracked under the cache | 1a, 2, 9 | `pull-entry.test.mjs` (licence, guard W), gitignore test, `git ls-files game-client/studio-cache` empty |
| Cold cache + unreachable Asset Studio fails loudly; local Gate 1 refuses `ATLAS_SKIP_STUDIO=1`; only CI skips, with `::warning::`; 401/403 = `studio auth failed` | 1a, 2, 8 | CLI exit 2 test, auth test, real-gate test (exit 1 / exit 0), precheck cold-cache + skip-refused + ci.yml tests |
| (rev 3) No private image ships: the baker never queues a pull entry; guard (W) fails on a `studio-cache/` thumbnail row or a tracked `.import`/`.tscn`/`.tres` naming it; exports exclude `studio-cache/*` | 1a, 2 | `bake-thumbnails-pull.test.mjs`, guard-W sandbox test, export-preset test, phase-gate greps |
| (rev 3) Every new fixture is committable | 1a, 2 | `git check-ignore` test in `pull-entry.test.mjs` |
| (rev 3) Bounded calls: fetch 30 s, kubectl 20 s, import 900 s separate from probe 180 s | 1a, 4 | abort-signal/kubectl-timeout test, import-bound tests |
| (rev 3) Strip renders the real sergeant, never the capsule | 9 | `resolved … (tier Bespoke)` line; capsule red run |
| Intake from a batch report row, default clip map, wall time and batch credits recorded | 2 | `rowFromReport`/`defaultAnimsFor` tests, done-line tests, Step 4 command + `intake: done in … · credits …` line |
| Sergeant renders at true scale (1.05 m ±5%) | 7 | `CheckEntityViewWiring` height case |
| Run/death fallback order | 5 | `CheckFallbackOrder` + mutation (d) |
| Gate 1 runs the new section, green; red by breaking the manifest | 8 | test-mode red/green + full Gate 1 |
| Render strip panel + wiki page load via a tested deep link; phone + desktop shots viewed. Rev 2: the wiki text is in the release app, the strip is on the edit host (private render, not in the image) | 9, 10, 11 | curl -L + shoot.mjs (both hosts), release strip URL → 404 |
| Strip non-blank means "the character is in the cell" | 9 | own-World3D stage, ≥ 3 % vs the no-character reference, `ATLAS_STRIP_NO_CHARACTER=1` red run |
| Design: intake is one non-interactive command | 2 | Step 4 command (no prompts, no hand-written JSON) |
| Design: wire inputs client-only; block/remote attack filed | 7 | I-255 already filed (`37df4df4a`) |

## Self-review (done while writing; re-run by the controller before execution)

- **Coverage:** every acceptance box maps to a task (table above). Every "proven red" the spec demands has a command with an expected exit code: clip rename (probe + manifest gate + Gate 1), death removal, KayKit skeleton, 16k triangles, sha256 mismatch. Extra mutations in Tasks 5-6 guard the suite against cases that can never fail.
- **Placeholders:** none. Verdict strings, the `--print-plan` flag, `applyNameMap`'s arity, the lore class names and the CSS tokens were all read from disk. One fact is checked during execution: the imported bone names (`prop_weapon_r`, `mixamorig_RightHand`, `mixamorig_Hips`). The probe asserts each one, and Task 6 Step 3 says what to do if one differs.
- **Type consistency:** `ResolveAnimVariants` returns `IReadOnlyDictionary<string, IReadOnlyList<string>>` in Tasks 4, 5, 7 and 9; `AnimationController` ctor third argument has that same type; `PipelineCharVerify.Key` is used by Task 9; `stateKeysForKind` is exported in Task 1 and used in Task 2; the manifest `anims` value is "string | non-empty string[]" in validate, intake, the gate and C#.
- **Blast radius:** the legacy path is byte-for-byte the old `Update` for entries without `combat_idle` (all 8 current anims entries; the sergeant is the 9th entry and the only combat-mapped one). The scale change touches only `kind: pipelineCharacter` entries. The new Gate 1 section is path-gated. The manifest gate change is green on today's content (checked). No server or schema edits.
- **Open owner items (report, don't block):** D3 budget numbers, now with a frame-time figure to add once measured; the `combat_idle → block_idle` mapping, which is visible in the strip; the release app shows the wiki text but not the private strip (it lives on the edit host). The CC0 ledger question is **closed** by the owner's R0 decision: `studio-private`, pull-only.

## Audit trail

- 2026-11-06 rev 2, owner R0: pull by manifest, never commit. The sergeant stays in Asset Studio; the entry records asset id, tag p4b-11050912, sha256 and `studio-private`; bytes go to the gitignored `game-client/studio-cache/` (Task 1a, Task 2).
- 2026-11-06 rev 2, found while planning: the approved Asset Studio bytes hash to `7f1c54c3…`, not the local pack `0ac13d97…` (1,742 buffer bytes differ). Every task now pins the API sha.
- HIGH, Task 5 mutation revert wiped the implementation: commit first, mutate, revert with `git checkout HEAD -- <file>` + `git diff --exit-code HEAD`.
- HIGH, Task 6 mutation in untracked `WeaponSocket.cs`: commit first, then mutate and revert from HEAD.
- HIGH, `ATLAS_VERIFY_MANIFEST` exists only in `GameRoot.cs:37` (never-run scene): call dropped, no GameRoot hook; every Godot call in `godot-verify.sh` bounded by `timeout` (gtimeout/perl fallback) and still needs the PASS marker. Tested by the timeout case.
- MEDIUM, sha "approval" compared the file with itself: the sha now comes from the Asset Studio API record of the approved asset; `approvals/*.json` removed.
- MEDIUM, NPC 0.68 scale would render the sergeant at 0.71 m: `pipelineCharacter` entries scale 1.0, with a probe assertion of 1.05 m ±5%.
- MEDIUM, fresh worktrees lack `.godot/imported`: `godot-verify.sh` imports first (also for a pulled glb without `.import`); `dotnet` and `godot-mono` added to `scripts/system-deps.json` (and `kubectl` for the token route).
- MEDIUM, strip non-blank check could pass on scene geometry: own-World3D SubViewport stage, ≥ 3 % change vs a no-character reference, red run via `ATLAS_STRIP_NO_CHARACTER=1`.
- MEDIUM, goal fidelity: intake runs from a batch report row (`--from-report --slug`) with the default 12-clip pipeline map and prints its wall time; no hand-written approval JSON.
- LOW, "9 anims entries" was 8 existing: fixed in Task 3 and the self-review.
- LOW, the parseArgs test already passed: replaced by a CLI usage test for `--from-report` without `--slug`.
- LOW, zsh-only `${pipestatus[1]}`: the exit code is captured before the grep (works in bash and zsh).
- LOW, wiki overstated hit wiring: the text now says the flinch plays only on targets the local player hits (`VerticalSliceRoot.cs:1552`).
- LOW, no test for run/death fallback order: `CheckFallbackOrder` + mutation (d).
- Precheck (rev 2): a cold cache with Asset Studio unreachable FAILS. (Rev 3 supersedes the rev-2 SKIP path; see below.)
- 2026-11-06 rev 3 re-audit, CRITICAL (fix 1), thumbnail leak: `bake_thumbnails.mjs` `collectJobs` queued every manifest `scene`, writing into the tracked, shipped `.thumbs/`. Task 2 skips `entry.pull` there (failing-first `bake-thumbnails-pull.test.mjs`), guard (W) now fails on a `studio-cache/` row in `.thumbs/index.json` or a tracked `.import`/`.tscn`/`.tres` naming `res://studio-cache/`, and `bake_thumbnails.mjs` is in `PIPELINE_CHAR_PATHS`.
- rev 3, HIGH (fix 2), ignored fixture: `atelier/asset-forge/.gitignore:2` ignores `fixtures/`; the report fixture moved to `atelier/asset-forge/tests/studio-report.fixture.json` everywhere, plus a `git check-ignore` test over every new fixture.
- rev 3, HIGH (fix 3), intake was described, not written: Task 2 now carries the whole `intake.mjs` (imports, `done()`, staging, default anims, in-memory normalize for pull mode, rollback that never deletes the cache file, studio dry-run, one full `loadConfig()`, no `.import` reminder in pull mode) and tests for cache survival, dry-run, the reminder and `--dest-name`.
- rev 3, MEDIUM (fix 4), orchestrator decision: local Gate 1 never accepts a studio SKIP; `ATLAS_SKIP_STUDIO=1` fails the section with `studio skip not allowed in Gate 1`; only `ci.yml` skips, with a `::warning::` line. Tests: skip-refused, cold-cache, ci.yml warning; the pull-entry SKIP test asserts exit 0 (and exit 1 without it).
- rev 3, MEDIUM (fix 5): `PIPELINE_CHAR_PATHS` gains `.gitignore`, `ci.yml`, the five new script tests plus the bake test, `scripts/tests/fixtures/studio/`, `bake_thumbnails.mjs`, `content/asset-taxonomy.json`, `art-source/LICENSES.md` (`license-policy.mjs` was already in); the selector test lists each.
- rev 3, MEDIUM (fix 6), timeouts: `--import` bounded by `ATLAS_GODOT_IMPORT_TIMEOUT` (900 s), probes keep 180 s; `fetch` uses `AbortSignal.timeout(30000)`, kubectl/dev-token `timeout: 20000`; 401/403 is a hard FAIL `studio auth failed`, never unreachable. Tests for each.
- rev 3, MEDIUM (fix 7): the strip pulls and imports first, prints the resolved scene path and tier, and fails unless the tier is Bespoke; a capsule red run is in Step 3.
- rev 3, LOW (fix 8): the selector's expected red is exit 2 `unknown flag` (`precheck.sh:211`); `export_presets.cfg` `exclude_filter="studio-cache/*"` with a test.
- rev 3, goal fidelity (fix 9): the intake done line carries wall time and the batch's `credits_spent` / `credits_est` (plus gen seconds); batch-loop intake of ranger/warden is named the next feature in Non-goals, idea text in `handoff.md`.
