# Asset Forge (F-003) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reusable Blender→glb→manifest pipeline (`tools/asset-forge/`) proven by flipping `mob:aggressive` from seed to a bespoke kitbashed model.

**Architecture:** Creative authoring stays interactive (Blender via blender-mcp, runbook-governed); everything after the `.blend` is deterministic scripts: bake (headless Blender export + provenance stamp), validate (Khronos structural + game rules from `forge.config.json`), intake (transactional manifest wiring). Validation also runs in CI against every committed bespoke glb.

**Tech Stack:** Node ≥20 ESM (`.mjs`, built-in `node --test` runner), `@gltf-transform/core`, `gltf-validator` (Khronos npm), Blender 4.5 headless python (bake only), existing rails: `scripts/check_asset_manifest.mjs`, storybook, `ATLAS_VERIFY_*` probes.

**Spec:** `docs/superpowers/specs/2026-07-15-asset-forge-design.md`. One deliberate deviation: test fixture glbs are **generated at test time** by a deterministic `@gltf-transform` script from the committed donor (not baked once and committed) — no new binaries in git, CI-reproducible.

## Global Constraints

- Work happens in the claimed F-003 worktree (`/ps-release-workflow:claim F-003`), branch off `release/1.2`. Never edit the main checkout.
- Blender ≥ 4.5 asserted by bake; Blender is NEVER required by validate/intake/CI/tests (bake's own test is local-only, auto-skipped when Blender absent).
- Effective clip-map (logical state → glb clip name), from `AnimationController.cs`: `idle→idle`, `walk→walk`, `run→sprint`, `attack→attack-melee-right`, `death→die`. Manifest `anims` override may remap; validator must honor it.
- Character budgets: height 1.6–2.0u, ≤10 000 triangles, textures ≤1024×1024 (all in `forge.config.json`, never hardcoded).
- Bespoke rule violations = hard fail; seed tier = warn-only (known 0.7u seed scale bug must NOT redden CI).
- `snake_case` asset names; `.glb` + `.import` sidecar committed together; sources under `art-source/bespoke/<name>/source/` (LFS covers `art-source/**` already — verify, do not duplicate rules).
- All new Node code ESM `.mjs`, no TypeScript, no additions to the server pnpm workspace; forge deps live only in `tools/asset-forge/package.json`.
- Conventional commits; one commit per task; never `--amend`.
- Every task ends with its verify step green before commit (evidence, not "should work").

## File Structure

```
tools/asset-forge/
  package.json             # private; deps: @gltf-transform/core, gltf-validator
  forge.config.json        # per-kind budgets + defaultClipMap + rigReference path
  lib/gltf.mjs             # shared: loadGlb, sceneHeight, countTriangles, listClipNames, jointNames, maxTextureSize, readStamp
  lib/manifest.mjs         # shared: readManifest, writeManifestEntry (atomic), repoRoot
  validate.mjs             # CLI + export validateGlb()/validateManifest()
  intake.mjs               # CLI + export intake() — transactional
  bake.sh                  # orchestrates: blender -b --python bake_export.py, then stamp.mjs
  bake_export.py           # Blender-side glTF export per delivery spec
  stamp.mjs                # injects asset.extras.atlasForge provenance
  extract-bones.mjs        # donor glb → rig-reference/kenney-mini.bones.json
  rig-reference/kenney-mini.bones.json   # committed reference (generated once)
  tests/make-fixtures.mjs  # generates fixtures/ from the donor at pretest
  tests/validate.test.mjs
  tests/intake.test.mjs
  fixtures/                # GENERATED, gitignored
  README.md                # authoring runbook
Modify:
  .github/workflows/ci.yml           # validate step after drift-gate
  art-source/LICENSES.md             # proof-mob entry (Task 8)
  game-client/assets/manifest.json   # via intake (Task 8)
Create (proof mob):
  art-source/bespoke/mob_aggressive_brute/source/mob_aggressive_brute.blend
  game-client/assets/characters/mob_aggressive_brute.glb (+ .import)
```

Donor for reference/fixtures: `art-source/seed/kenney-mini-characters/character-male-b.glb` (CC0, committed via LFS).

---

### Task 1: Scaffold package, config, shared gltf lib

**Files:**
- Create: `tools/asset-forge/package.json`, `tools/asset-forge/forge.config.json`, `tools/asset-forge/lib/gltf.mjs`, `tools/asset-forge/tests/gltf.test.mjs`, `tools/asset-forge/.gitignore` (`node_modules/`, `fixtures/`)

**Interfaces (Produces):**
- `forge.config.json`: `{ kinds: { character: { heightRange:[1.6,2.0], maxTriangles:10000, maxTextureSize:1024, requiredStates:["idle","walk","run","attack","death"] } }, defaultClipMap:{idle:"idle",walk:"walk",run:"sprint",attack:"attack-melee-right",death:"die"}, rigReference:"rig-reference/kenney-mini.bones.json" }`
- `lib/gltf.mjs`: `loadGlb(path)→Document`, `sceneHeight(doc)→number` (bbox Y extent, u), `minY(doc)→number`, `countTriangles(doc)→number`, `listClipNames(doc)→string[]`, `jointNames(doc)→string[]` (sorted unique), `maxTextureSize(doc)→number`, `readStamp(doc)→object|null` (asset.extras.atlasForge)

- [ ] **Step 1:** `package.json`:

```json
{
  "name": "@atlas/asset-forge",
  "private": true,
  "type": "module",
  "scripts": {
    "pretest": "node tests/make-fixtures.mjs",
    "test": "node --test tests/"
  },
  "dependencies": {
    "@gltf-transform/core": "^4.1.0",
    "gltf-validator": "^2.0.0-dev.3.10"
  }
}
```

`npm install --prefix tools/asset-forge` (commits `package-lock.json`).

- [ ] **Step 2:** write `forge.config.json` exactly as in Interfaces.
- [ ] **Step 3 (failing test):** `tests/gltf.test.mjs` — run helpers against the DONOR glb (no fixtures yet):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGlb, sceneHeight, listClipNames, jointNames, countTriangles, readStamp } from "../lib/gltf.mjs";
const DONOR = new URL("../../../art-source/seed/kenney-mini-characters/character-male-b.glb", import.meta.url).pathname;

test("donor measurements", async () => {
  const doc = await loadGlb(DONOR);
  const h = sceneHeight(doc);
  assert.ok(h > 0.5 && h < 1.0, `kenney donor ~0.7u, got ${h}`);
  assert.ok(listClipNames(doc).includes("idle"));
  assert.ok(listClipNames(doc).includes("attack-melee-right"));
  assert.ok(jointNames(doc).length > 5);
  assert.ok(countTriangles(doc) > 100);
  assert.equal(readStamp(doc), null);
});
```

Run `npm test --prefix tools/asset-forge` → FAIL (lib missing). (Temporarily stub `pretest` as `true` until Task 3.)

- [ ] **Step 4:** implement `lib/gltf.mjs` with `NodeIO` + `getBounds` from `@gltf-transform/core`; triangles = Σ over mesh primitives (mode 4) of `indices.count/3` (or `POSITION.count/3` unindexed); textures via `texture.getSize()`; stamp via `doc.getRoot().getAsset().extras?.atlasForge ?? null`.
- [ ] **Step 5:** test → PASS. If the donor is an LFS pointer (CI without LFS), tests must `t.skip("donor is LFS pointer")` — detect via file starting with `version https://git-lfs`.
- [ ] **Step 6:** Commit `feat(asset-forge): scaffold package, config, gltf helpers`.

---

### Task 2: Bake — bake_export.py + stamp.mjs + bake.sh

**Files:**
- Create: `tools/asset-forge/bake_export.py`, `tools/asset-forge/stamp.mjs`, `tools/asset-forge/bake.sh`, `tools/asset-forge/tests/bake.local.test.sh`

**Interfaces:**
- Consumes: `lib/gltf.mjs` (stamp verification).
- Produces: `bash tools/asset-forge/bake.sh <src.blend> <out.glb>` → spec-compliant stamped glb. `node stamp.mjs <glb> --blender <ver> --blend-sha <sha>` idempotently injects `asset.extras.atlasForge={blender,blendSha256,forge}`.

- [ ] **Step 1:** `bake_export.py` (runs inside Blender):

```python
import bpy, sys, json
argv = sys.argv[sys.argv.index("--") + 1:]
out = argv[argv.index("--out") + 1]
assert bpy.app.version >= (4, 5), f"Blender >=4.5 required, got {bpy.app.version}"
assert any(o.type == "ARMATURE" for o in bpy.data.objects), "no armature in scene"
bpy.ops.export_scene.gltf(
    filepath=out, export_format="GLB",
    export_apply=True,               # apply modifiers/transforms
    export_animations=True, export_skins=True,
    export_yup=True,                 # glTF +Y up
    export_image_format="AUTO",
)
print(json.dumps({"ok": True, "out": out, "blender": ".".join(map(str, bpy.app.version))}))
```

- [ ] **Step 2:** `stamp.mjs` — load glb via `lib/gltf.mjs`, set `root.getAsset().extras.atlasForge = {blender, blendSha256, forge: "1"}`, write back.
- [ ] **Step 3:** `bake.sh` — resolve `BLENDER` env (default `/Applications/Blender.app/Contents/MacOS/Blender`), fail with clear message if absent; `"$BLENDER" -b "$1" --python bake_export.py -- --out "$2"`; then `node stamp.mjs "$2" --blender <parsed> --blend-sha "$(shasum -a 256 "$1" | cut -d' ' -f1)"`; `set -euo pipefail`.
- [ ] **Step 4 (verify, local-only):** `tests/bake.local.test.sh`: skip 0 if no `$BLENDER`; else build a throwaway .blend from the donor (`"$BLENDER" -b --python-expr "import bpy; bpy.ops.import_scene.gltf(filepath='<donor>'); bpy.ops.wm.save_as_mainfile(filepath='/tmp/forge_bake_test.blend')"`), run `bake.sh`, then `node -e` assert `readStamp() != null && listClipNames().includes("idle")`. Run it → PASS locally.
- [ ] **Step 5:** Commit `feat(asset-forge): headless bake with provenance stamp`.

---

### Task 3: Rig reference + generated fixtures

**Files:**
- Create: `tools/asset-forge/extract-bones.mjs`, `tools/asset-forge/rig-reference/kenney-mini.bones.json`, `tools/asset-forge/tests/make-fixtures.mjs`

**Interfaces:**
- Consumes: `lib/gltf.mjs`.
- Produces: `rig-reference/kenney-mini.bones.json` = `{"joints":[...sorted bone names...]}` from the donor. `tests/make-fixtures.mjs` writes to `fixtures/`: `good.glb` (donor scaled to 1.8u via root-node scale + stamped), `too_short.glb` (donor as-is + stamped), `missing_clip.glb` (good minus the `die` animation), `renamed_bone.glb` (good with one joint renamed `arm-left`→`arm_left_x`), `no_provenance.glb` (good unstamped). Skips (exit 0, message) if donor is an LFS pointer.

- [ ] **Step 1:** `extract-bones.mjs` — collect names of all nodes used as skin joints, sorted unique, write JSON. Run once against the donor; commit the JSON.
- [ ] **Step 2:** `tests/make-fixtures.mjs` — scale: multiply root scene nodes' scale by `1.8 / sceneHeight(doc)`; drop animation by name; rename joint node; stamp via same code path as `stamp.mjs` (import it).
- [ ] **Step 3 (verify):** restore real `pretest`; `npm test --prefix tools/asset-forge` → gltf tests still PASS and fixtures exist; spot-check `node -e` that `sceneHeight(good.glb)` ∈ [1.75,1.85].
- [ ] **Step 4:** Commit `feat(asset-forge): rig reference + generated test fixtures`.

---

### Task 4: validate.mjs

**Files:**
- Create: `tools/asset-forge/validate.mjs`, `tools/asset-forge/tests/validate.test.mjs`

**Interfaces:**
- Consumes: `lib/gltf.mjs`, `forge.config.json`, `rig-reference/kenney-mini.bones.json`, fixtures.
- Produces: `validateGlb(path, {kind, tier="bespoke", anims=null, configDir})→{failures:string[], warnings:string[]}`; `validateManifest(manifestPath, {configDir})→{failures, warnings}` (per-entry, tier-aware severity, missing file = drift-gate's job → skip). CLI: `node validate.mjs <glb> --kind character [--tier seed] [--anims '<json>']` and `node validate.mjs --manifest <path>`; prints `FAIL <rule>: <measured> (expected <rule>)` / `WARN ...`; exit 1 iff failures.

- [ ] **Step 1 (failing tests):**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGlb } from "../validate.mjs";
const fx = (n) => new URL(`../fixtures/${n}`, import.meta.url).pathname;
const kind = "character";

test("good passes", async () => {
  const r = await validateGlb(fx("good.glb"), { kind });
  assert.deepEqual(r.failures, []);
});
test("too short fails on height (bespoke) / warns (seed)", async () => {
  assert.match((await validateGlb(fx("too_short.glb"), { kind })).failures.join(), /height/);
  const seed = await validateGlb(fx("too_short.glb"), { kind, tier: "seed" });
  assert.deepEqual(seed.failures, []);
  assert.match(seed.warnings.join(), /height/);
});
test("missing clip fails naming the state", async () => {
  assert.match((await validateGlb(fx("missing_clip.glb"), { kind })).failures.join(), /death.*die/);
});
test("renamed bone fails skeleton", async () => {
  assert.match((await validateGlb(fx("renamed_bone.glb"), { kind })).failures.join(), /skeleton/);
});
test("no provenance warns only", async () => {
  const r = await validateGlb(fx("no_provenance.glb"), { kind });
  assert.deepEqual(r.failures, []);
  assert.match(r.warnings.join(), /provenance/);
});
```

Run → FAIL (module missing).

- [ ] **Step 2:** implement. Rules in order: Khronos structural (`gltf-validator`'s `validateBytes`, errors→failures); height via `sceneHeight` vs `kinds[kind].heightRange`; pivot `|minY| ≤ 0.02` and bbox X/Z center within ±0.1u; clips: for each `requiredStates` state, mapped name = `(anims ?? defaultClipMap)[state]`, must be in `listClipNames`; skeleton: `jointNames(doc)` set-equal to reference; triangles ≤ budget; textures ≤ budget; naming `basename` matches `/^[a-z0-9_]+\.glb$/`; license: entry name appears in `art-source/LICENSES.md` (resolve from repo root; in `validateGlb` only when `--license-ledger` path provided, always in `validateManifest`); provenance stamp → warn if absent. Tier `seed` demotes rule failures to warnings (structural errors stay failures).
- [ ] **Step 3:** tests → PASS.
- [ ] **Step 4:** manifest mode test: temp manifest with a bespoke entry pointing at `too_short.glb` → failures non-empty; same entry `tier:"seed"` → warnings only. → PASS.
- [ ] **Step 5:** Commit `feat(asset-forge): glb validator (Khronos + game rules)`.

---

### Task 5: intake.mjs (transactional)

**Files:**
- Create: `tools/asset-forge/intake.mjs`, `tools/asset-forge/lib/manifest.mjs`, `tools/asset-forge/tests/intake.test.mjs`

**Interfaces:**
- Consumes: `validateGlb`, `lib/gltf.mjs`.
- Produces: `intake(glbPath, {key, license, root, dryRun=false, driftGate=defaultRunner})→{ok, actions[]}`. CLI: `node intake.mjs <glb> --key mob:aggressive --license "<text>" [--dry-run]`. Order: validate (abort clean) → copy glb to `<root>/game-client/assets/characters/` → backup+write manifest entry `{scene:"res://assets/characters/<name>.glb", source:"internal", license, tier:"bespoke", kind:"character"}` → run drift-gate (`node <root>/scripts/check_asset_manifest.mjs`) → on ANY post-validate failure restore manifest backup + delete copied glb, exit 1. Prints reminder: `Commit the Godot .import sidecar together with the glb`.

- [ ] **Step 1 (failing tests):** sandbox = temp dir with minimal tree (`game-client/assets/manifest.json` copy with `mob:aggressive` seed entry, empty `characters/`, stub drift-gate runner injected):

```js
test("happy path flips entry and copies glb", async () => {
  const r = await intake(fx("good.glb"), { key: "mob:aggressive", license: "CC0 test", root: sandbox, driftGate: async () => ({ ok: true }) });
  assert.ok(r.ok);
  const m = JSON.parse(await readFile(join(sandbox, "game-client/assets/manifest.json")));
  assert.equal(m.entries["mob:aggressive"].tier, "bespoke");
  assert.ok(existsSync(join(sandbox, "game-client/assets/characters/good.glb")));
});
test("drift-gate failure rolls everything back", async () => {
  const before = await readFile(manifestPath, "utf8");
  const r = await intake(fx("good.glb"), { key: "mob:aggressive", license: "CC0 test", root: sandbox, driftGate: async () => ({ ok: false }) });
  assert.equal(r.ok, false);
  assert.equal(await readFile(manifestPath, "utf8"), before);
  assert.ok(!existsSync(join(sandbox, "game-client/assets/characters/good.glb")));
});
test("validation failure aborts with zero side effects", async () => { /* too_short.glb; assert no copy, manifest untouched */ });
test("dry-run reports actions, writes nothing", async () => { /* actions[] non-empty, fs untouched */ });
test("re-run same key is idempotent", async () => { /* run twice, second succeeds, one entry */ });
```

Run → FAIL.
- [ ] **Step 2:** implement (`lib/manifest.mjs`: atomic write = tmp file + rename; `repoRoot()` = `git rev-parse --show-toplevel`).
- [ ] **Step 3:** tests → PASS. Full suite `npm test --prefix tools/asset-forge` → PASS.
- [ ] **Step 4:** Commit `feat(asset-forge): transactional intake`.

---

### Task 6: CI wiring + authoring runbook

**Files:**
- Modify: `.github/workflows/ci.yml` (after the drift-gate step, same job)
- Create: `tools/asset-forge/README.md`

- [ ] **Step 1:** CI step:

```yaml
      - name: Asset forge — validate manifest glbs
        run: |
          npm ci --prefix tools/asset-forge
          node tools/asset-forge/validate.mjs --manifest game-client/assets/manifest.json
```

Confirm the checkout step has `lfs: true` (glbs must be real files here); add it if missing.
- [ ] **Step 2:** README runbook — the AUTHOR recipe verbatim from the spec: donor import; may-change (mesh/materials/textures) vs must-not-change (bone names/hierarchy, armature modifiers, clip names); **scale to 1.6–2.0u** (donors ~0.7u; document the working apply-scale-with-actions procedure discovered in Task 7); save path convention; bake/validate/intake command block; `.import` sidecar rule; troubleshooting table keyed by validator rule names.
- [ ] **Step 3 (verify):** `act` not required — run the two commands locally from repo root; validator exits 0 with seed warnings listed.
- [ ] **Step 4:** Commit `feat(asset-forge): CI validation + authoring runbook`.

---

### Task 7: AUTHOR the proof mob (interactive — main session, NOT a subagent)

Requires: Blender open with the blender-mcp bridge connected (port 9876).

**Files:**
- Create: `art-source/bespoke/mob_aggressive_brute/source/mob_aggressive_brute.blend`

- [ ] **Step 1:** import donor `character-male-b.glb` into a fresh Blender scene.
- [ ] **Step 2:** kitbash to a "brute": bulk up silhouette (proportional-edit scale on torso/arms), darken palette / new colormap variant, optional part swap from another donor. Do NOT touch armature bones, modifiers, or action names.
- [ ] **Step 3:** scale whole character to ≈1.8u; apply transforms. If applying armature scale distorts location F-curves, use the documented fallback (scale at export via a root empty, or Blender's "Apply Object Transform → also apply to actions" path); record whichever procedure worked in the README (Task 6 left a placeholder section for exactly this).
- [ ] **Step 4 (in-Blender verify):** 32 actions present; bone count/names unchanged (compare against `rig-reference` via a python snippet through the MCP bridge); height ≈1.8u at rest pose.
- [ ] **Step 5:** save `.blend` to the path above; commit `feat(asset-forge): mob_aggressive_brute source (kitbash of Kenney character-male-b)` (LFS).

---

### Task 8: Ship the proof mob through the forge

**Files:**
- Create: `game-client/assets/characters/mob_aggressive_brute.glb` (+ `.import` after a Godot import)
- Modify: `art-source/LICENSES.md`, `game-client/assets/manifest.json` (via intake only)

- [ ] **Step 1:** `bash tools/asset-forge/bake.sh art-source/bespoke/mob_aggressive_brute/source/mob_aggressive_brute.blend /tmp/mob_aggressive_brute.glb`
- [ ] **Step 2:** add `LICENSES.md` entry: `mob_aggressive_brute — internal kitbash derived from Kenney Mini Characters (CC0); result CC0`.
- [ ] **Step 3:** `node tools/asset-forge/validate.mjs /tmp/mob_aggressive_brute.glb --kind character` → exit 0, zero failures, provenance present. Fix-loop back to Task 7 if not.
- [ ] **Step 4:** `node tools/asset-forge/intake.mjs /tmp/mob_aggressive_brute.glb --key mob:aggressive --license "CC0 (internal kitbash, Kenney-derived)"` → ok; drift-gate green.
- [ ] **Step 5:** open the Godot project once (headless `--import` is fine) to generate `mob_aggressive_brute.glb.import`; commit it with the glb.
- [ ] **Step 6 (verify, evidence):** storybook (`python3 -m http.server 8099`, check the `mob:aggressive` card renders the brute + animation dropdown plays); headless `ATLAS_VERIFY_ENTITYVIEW=1` and `ATLAS_VERIFY_ANIM=1` probes PASS; windowed run — aggressive mob uses the new model with idle/walk/attack/death working.
- [ ] **Step 7:** `node tools/asset-forge/validate.mjs --manifest game-client/assets/manifest.json` → 0 failures (seed warnings expected). Full forge test suite PASS.
- [ ] **Step 8:** Commit `feat(asset-forge): mob:aggressive bespoke via forge pipeline`.

---

## Per-phase quality gate (global rule #7)

Tasks 1–6 (tooling) and 7–8 (content) each end with: verify (above) → independent adversarial review of the task diff → act on findings → re-verify. Subagent-driven-development's two-stage review satisfies this; Task 7's review = the in-Blender verify plus Task 8's validator run (the validator IS the reviewer for content).

## Done =

All 8 tasks committed on the F-003 feature branch; forge suite + drift-gate + CI validate step green; proof mob visible and animated in storybook and game; then `/ps-release-workflow:ship` (Gate 1) merges F-003 into release/1.2.
