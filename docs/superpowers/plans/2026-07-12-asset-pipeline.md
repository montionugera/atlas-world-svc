# Asset Build Pipeline — Implementation Plan (F-002, Stage 0 + 0.5)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> Spec: `docs/superpowers/specs/2026-07-12-asset-pipeline-design.md`. Line: `release/1.2`, feature `F-002`.

**Goal:** Stand up the client asset pipeline spine (server-type-id → asset content registry with graceful three-tier fallback, a codegen-emitted key set, a CI drift-gate) and seed it with CC0 assets so the game renders real low-poly content instead of capsules and the system is never empty.

**Architecture:** The contracts codegen (already TS→C#) additionally emits the set of renderable/audible server type ids as JSON. A committed JSON manifest maps each type id → `{ scene, source, license, tier }`. A Godot `AssetRegistry` autoload loads the manifest and resolves `type id → PackedScene`, best-available (bespoke → CC0 seed → procedural capsule). A CI script gates that every emitted key has a manifest entry whose `res://` file exists and carries license+source. Stage 0.5 ingests CC0 seeds (Quaternius/Kenney) through the same intake and maps them as the seed tier.

**Tech Stack:** Godot 4.7 (C#/.NET 8), TypeScript codegen (`colyseus-server/scripts/codegen/`), pnpm workspace, Node CI scripts, Git LFS, GitHub Actions.

## Global Constraints

- **Server is never modified** — assets are a pure client concern.
- **Units:** every imported model normalized so **1 unit = 1 m**, matching the authoritative physics world (server world units; rendering multiplies by `scale`). Pivot at feet for characters, center for props; Godot −Z forward.
- **Manifest format = JSON** (D1). **`art-source/` = Git LFS in-repo** (D2). **Expected keys come from the extended codegen** (D3) — one generated source of truth shared by the manifest and the gate.
- **Graceful fallback is mandatory:** a missing/unknown asset never throws — it renders the procedural capsule and logs a warning.
- **No external asset downloads** until Stage 0.5 is reached AND the user gives an explicit go; each seeded asset's CC0 license recorded at intake.
- Conventional commits; one commit per task; never `git commit --amend`.
- Per-phase quality gate (global rule #7): each task ends verified → independent review → refactor → re-verify before advancing.

## File Structure

| Path | Responsibility |
|---|---|
| `colyseus-server/scripts/codegen/gen-asset-keys.*` | Emit `asset-keys.json` — the set of renderable/audible server type ids |
| `colyseus-server/generated/asset-keys.json` | Generated key list (committed; drift-checked) |
| `game-client/assets/manifest.json` | The content manifest (type id → asset + license + source + tier) |
| `game-client/src/Content/AssetManifest.cs` | Parse + hold the manifest |
| `game-client/src/Content/AssetRegistry.cs` | Autoload; three-tier `Resolve(typeId)` |
| `game-client/src/World/EntityView*.cs` | Consume the registry for entity visuals (capsule fallback preserved) |
| `game-client/scenes/tools/*` | (Stage 1, later) storybook scenes |
| `scripts/check_asset_manifest.mjs` | CI drift-gate |
| `.github/workflows/ci.yml` | Add the asset-gate job/step |
| `art-source/` + `.gitattributes` | LFS-tracked raw originals + license records |
| `docs/asset-intake.md`, `docs/asset-delivery-spec.md` | Ingest checklist + artist delivery spec |

---

### Task 1: Codegen emits the renderable/audible key set (D3)

**Files:**
- Explore first: `colyseus-server/scripts/codegen/` and `colyseus-server/src/tests/codegen/gen-csharp.test.ts` — mirror the existing generator's structure/entrypoint exactly.
- Create: `colyseus-server/scripts/codegen/gen-asset-keys.ts` (or `.mjs`, matching the existing codegen language)
- Create (generated): `colyseus-server/generated/asset-keys.json`
- Test: `colyseus-server/src/tests/codegen/gen-asset-keys.test.ts`

**Interfaces:**
- Produces: `asset-keys.json` shaped `{ "version": 1, "keys": [{ "id": "mob:spear_thrower", "kind": "character" }, { "id": "projectile:spear", "kind": "vfx" }, ...] }`. `id` = stable server type id; `kind` ∈ `character|prop|vfx|audio`. Key set drawn from the same server config the contracts codegen already reads (`mobTypesConfig`, skills, projectile types) — **read those configs to enumerate real ids; do not hand-list.**

- [ ] **Step 1: Write the failing test** — assert the generator writes `asset-keys.json`, that it contains at least the known mob type ids present in `mobTypesConfig`, and that every entry has a non-empty `id` + valid `kind`. (Model the assertions on `gen-csharp.test.ts`.)
- [ ] **Step 2: Run it, verify it fails** (`npm test -- gen-asset-keys` → generator/module missing).
- [ ] **Step 3: Implement `gen-asset-keys`** — enumerate renderable/audible server type ids from the existing config sources the contracts codegen uses; write the JSON deterministically (stable sort) so drift is meaningful.
- [ ] **Step 4: Run test → PASS.** Then run the full `test:contracts`/codegen suite to confirm no regression.
- [ ] **Step 5: Wire generation into the codegen entrypoint** so it runs wherever `gen-csharp` runs (same npm script), then commit generated `asset-keys.json`.
- [ ] **Step 6: Commit** — `feat(codegen): emit asset-keys.json (renderable/audible server type ids)`.

### Task 2: Manifest schema + loader

**Files:**
- Create: `game-client/assets/manifest.json` (initial: empty `entries: {}` — the registry falls back to capsules until Stage 0.5 fills it)
- Create: `game-client/src/Content/AssetManifest.cs`
- Test: `game-client/src/Content/tests/AssetManifestTests.cs` (mirror existing C# test setup under `game-client/`)

**Interfaces:**
- `manifest.json`: `{ "version": 1, "entries": { "<typeId>": { "scene": "res://…", "source": "ai|market|commission", "license": "…", "tier": "seed|bespoke", "kind": "character|prop|vfx|audio" } } }`
- Produces: `AssetManifest.Load(string resPath) : AssetManifest`; `bool TryGet(string typeId, out AssetEntry entry)`; `IReadOnlyList<AssetEntry> All`.

- [ ] **Step 1: Write the failing test** — load a small fixture manifest; assert `TryGet` returns a known entry and false for an unknown id; assert malformed JSON throws a clear parse error (not a null-ref).
- [ ] **Step 2: Run → fail** (class missing).
- [ ] **Step 3: Implement `AssetManifest`** — parse JSON (System.Text.Json), typed `AssetEntry`, defensive on missing fields.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(client): asset manifest schema + loader`.

### Task 3: AssetRegistry autoload — three-tier resolve

**Files:**
- Create: `game-client/src/Content/AssetRegistry.cs` (registered as an autoload in `project.godot`)
- Modify: `game-client/project.godot` (add the autoload)
- Test: `game-client/src/Content/tests/AssetRegistryTests.cs`

**Interfaces:**
- Consumes: `AssetManifest` (Task 2).
- Produces: `PackedScene Resolve(string typeId, out ResolveTier tier)` where `ResolveTier ∈ {Bespoke, Seed, Capsule}`. Resolution order: bespoke entry whose scene loads → seed entry whose scene loads → **procedural capsule PackedScene** (built in-code, the current visual). Unknown typeId or unloadable path → Capsule + `GD.PushWarning`. Never throws.

- [ ] **Step 1: Write the failing tests** — (a) bespoke entry with a loadable scene → returns it, tier=Bespoke; (b) entry whose `res://` path is missing → falls through to Capsule + warning, no throw; (c) unknown id → Capsule; (d) a seed-tier entry resolves when no bespoke exists. Use tiny fixture scenes under a test `res://` path.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `AssetRegistry`** — load manifest on `_Ready`; `Resolve` with the fallback chain; cache loaded `PackedScene`s; capsule builder factored from the existing `EntityView` capsule code (read it, reuse — don't duplicate).
- [ ] **Step 4: Run → PASS** (headless Godot test run).
- [ ] **Step 5: Commit** — `feat(client): AssetRegistry autoload with bespoke→seed→capsule resolve`.

### Task 4: Wire the registry into entity rendering

**Files:**
- Explore first: `game-client/src/World/EntityView*.cs` and `EntityManager.Spawn` — see exactly how a view's mesh/scene is currently constructed (the `CapsuleMesh`/`BoxMesh` path).
- Modify: `EntityView` (and/or `EntityManager.Spawn`) to instantiate `AssetRegistry.Resolve(typeId)` instead of the hardcoded primitive, keeping the capsule as the resolved fallback.
- Test: extend the entity-view tests (or add one) asserting a spawned entity whose type has a manifest entry uses the resolved scene, and one without falls back to a capsule.

**Interfaces:**
- Consumes: `AssetRegistry.Resolve` (Task 3). The `typeId` passed must match the codegen key form from Task 1 (e.g. `mob:<type>`), so **confirm the mapping from a live `Mob`/`Player`/`Projectile` to its key id** while wiring.

- [ ] **Step 1: Write the failing test** — spawn an entity with a manifested type → its view root is the resolved scene; spawn an unmanifested type → capsule. (Inject a fixture manifest.)
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** the swap; preserve pose/heading application (the smoother/interpolation path stays untouched — only the *visual node* source changes).
- [ ] **Step 4: Run → PASS**; then launch the client against a local server and confirm capsules still render for unmanifested types (no regression, no throw). Evidence per global rule #2.
- [ ] **Step 5: Commit** — `feat(client): entities render via AssetRegistry (capsule fallback preserved)`.

### Task 5: CI drift-gate

**Files:**
- Create: `scripts/check_asset_manifest.mjs`
- Modify: `.github/workflows/ci.yml` (add a job/step; build contracts + run codegen first so `asset-keys.json` is current)
- Test: the script self-tests via fixtures, OR a small `scripts/tests/` case; assert red-green (a missing entry / broken path / absent license each fail).

**Interfaces:**
- Consumes: `colyseus-server/generated/asset-keys.json` (Task 1) + `game-client/assets/manifest.json` (Task 2).
- Produces: exit 0 iff every key has a manifest entry whose `scene` file exists on disk and whose `license`+`source` are non-empty; else exit 1 with a per-violation report. Mirror the spirit of `colyseus-server/scripts/test_contracts.sh`.

- [ ] **Step 1: Write the failing test/fixtures** — a fixture pair with (a) a key missing from the manifest, (b) an entry pointing at a nonexistent `res://` file, (c) an entry missing `license`. Assert the checker exits non-zero and names each.
- [ ] **Step 2: Run → fail** (script missing).
- [ ] **Step 3: Implement `check_asset_manifest.mjs`** — resolve `res://` to the `game-client/` filesystem path; collect all violations before exiting (don't fail-fast) for a useful report.
- [ ] **Step 4: Run → PASS on the real committed pair** (empty manifest + keys: since Stage 0 ships empty, the gate must **warn-not-fail on unmapped keys but fail on broken/licenseless entries** — encode this: unmapped key = warning at Stage 0, hard-fail once `--require-complete` is set in Stage 0.5+).
- [ ] **Step 5: Wire into `ci.yml`** and push a throwaway branch to confirm the job runs green; then delete the branch.
- [ ] **Step 6: Commit** — `ci: asset manifest drift-gate (keys ↔ manifest ↔ files ↔ license)`.

### Task 6: `art-source/` LFS + intake/delivery docs

**Files:**
- Create/modify: `.gitattributes` (LFS-track `art-source/**` binary types: `*.blend *.fbx *.glb *.png *.wav *.ogg` etc.)
- Create: `art-source/README.md` + `art-source/LICENSES.md` (per-asset provenance/license ledger)
- Create: `docs/asset-intake.md` (the normalization checklist: scale→1m, orientation, pivot, naming, import preset, manifest stamp)
- Create: `docs/asset-delivery-spec.md` (one-pager for commissioned artists)

- [ ] **Step 1: Verify `git lfs` is installed/initialized** (`git lfs version`; `git lfs install` if needed). If unavailable, STOP and surface to the user (installing LFS is their call).
- [ ] **Step 2: Add `.gitattributes` LFS rules**; commit a tiny placeholder binary under `art-source/` and confirm `git lfs ls-files` lists it.
- [ ] **Step 3: Write `asset-intake.md` + `asset-delivery-spec.md` + `LICENSES.md` template** (the intake checklist is the operational contract — make the units/pivot rules explicit).
- [ ] **Step 4: Verify** the placeholder round-trips (clone/checkout shows the LFS pointer resolves) — or note if unverifiable locally.
- [ ] **Step 5: Commit** — `chore(assets): art-source LFS tracking + intake/delivery docs`.

---

### Task 7 (Stage 0.5): Ingest the CC0 seed set

> **GATE:** requires an explicit user "go" for downloads (safety rule + spec guardrail). Present the exact packs/URLs/sizes and confirm CC0 before fetching. Record each asset in `art-source/LICENSES.md` at intake.

**Files:**
- Add (LFS): raw originals under `art-source/seed/…`
- Add: baked assets under `game-client/assets/{characters,props,vfx,audio}/…`
- Modify: `game-client/assets/manifest.json` — a `tier: "seed"` entry for every current server type id from `asset-keys.json`
- Modify: enable the gate's `--require-complete` (Task 5) now that all keys are mapped

**Interfaces:** every key in `asset-keys.json` gains a resolving seed entry → `AssetRegistry.Resolve` returns Seed (never Capsule) for known types.

- [ ] **Step 1: Curate + confirm** — list the specific Quaternius (animated characters) + Kenney (props/particles/SFX) packs, licenses (CC0), and sizes; get the user's go.
- [ ] **Step 2: Fetch to `art-source/seed/`**, record each in `LICENSES.md`.
- [ ] **Step 3: Ingest per `asset-intake.md`** — normalize scale/orientation/pivot, import as `.glb`, bake into `game-client/assets/…`.
- [ ] **Step 4: Map every `asset-keys.json` id → seed entry** in `manifest.json`.
- [ ] **Step 5: Verify** — run the drift-gate with `--require-complete` → PASS; launch the client against a local server on a mob-heavy map → **real seed characters/props render instead of capsules** (screenshot evidence, rule #2).
- [ ] **Step 6: Flip the gate to hard-fail on unmapped keys** and commit.
- [ ] **Step 7: Commit** — `feat(assets): CC0 seed set (Quaternius/Kenney) mapped for all server types`.

---

## Self-review notes

- **Spec coverage:** spine (Tasks 1–5), intake/LFS/docs (Task 6), seed (Task 7) — all Stage 0 + 0.5 spec items mapped. Storybook (Stage 1) and VFX/audio/cutscene harnesses (Stages 2–4) are intentionally out of this plan.
- **Exploration flags (no-magic):** Tasks 1, 3, 4 require reading the existing codegen, `EntityView`, and entity→typeId mapping before writing final code — called out inline rather than fabricated.
- **Type consistency:** the `typeId` key form (`mob:<type>`, `projectile:<type>`) is defined in Task 1 and consumed identically in Tasks 2–7; the capsule fallback is the same procedural mesh throughout.
- **Ordering:** Task 1 → 2 → 3 → 4 gives a working registry over capsules (demoable with an empty manifest); 5 gates it; 6 sets up intake; 7 fills it with real assets. Each task is independently reviewable.
