# 2D pipeline: UI / icons / tiles / sprites

- verdict: needs-work  |  effort: L  |  dependsOn: ['registry-binding']
- proposed idea: 2D asset forge + icon/tileset/ninepatch seeding + meta-UI icon binding

## Domain: `ui-2d` — 2D asset pipeline (UI / icons / tiles / sprites / spritesheet-VFX)

### Goal
Close the 2D gap by building the missing **authoring loop** and **first consumer** for client-side 2D content, mirroring the proven glb `asset-forge` transactional-intake pattern. Icons, tilesets, ninepatch panels and spritesheets become sourceable → license-stamped → render-spec-validated → appended to `catalog-manifest.json` → previewable in storybook → rendered by the meta-UI. **2D keys carry no gameplay contract** and stay OFF the codegen keyspace — they live only in the curated `catalog-manifest.json` (driftGated:false).

### Grounded starting state (verified)
- **Contract exists**: `render-spec.json` v1 declares every 2D renderer with `require[]` (image=[license,source]; tileset=[+tileSize]; ninepatch=[+patchMargins]; theme/material=[+preview,previewHashOf, baked-preview staleness]; font=[+family]; texturemap=[+role]).
- **Gate exists**: `scripts/check_asset_manifest.mjs` enforces rules A–H incl. **H = curated sources may not use a reserved codegen namespace** (`codegenReservedNamespaces` = player, npc, mob:, projectile:, zone:, **item:**). `icon:`/`ui:`/`tileset:`/`sprite:`/`fx:`/`theme:` are deliberately NOT reserved.
- **Preview exists**: `tools/asset-storybook/index.html` has working Canvas2D `buildImage`/`Spritesheet`/`NinePatch`/`Tileset`/`Theme` (dispatch L893-897) — but atlas-JSON spritesheet is stubbed (L1115).
- **Analog to copy**: `tools/asset-forge/intake.mjs` = transactional validate→snapshot→copy→write-entry→drift-gate→rollback, glb-only, atomic writes via `lib/manifest.mjs`.
- **Missing**: no 2D authoring tool (catalog is hand-edited); meta-UI (`SkillTile.cs` Label+Button, `InventoryTile.cs` Label) renders NO icons; icons are orphaned demo assets; no client key→Texture2D loader.
- **Concrete consumer ids** (from `MetaIds.cs`): items `basic_sword, magic_staff, great_bow, potion_minor, leather_armor, iron_ore`; skills `power_strike, iron_skin` (+ rest of `SkillsById`).

---

### Phase 1 — 2D forge (transactional intake) + test scaffold + scope decisions
**Tasks**
- Record decisions (decision doc / vault): `icon:*` is a pure content namespace decoupled from reserved `item:*` (id→icon map is client-side, NOT in `asset-keys.json`); font/material/texturemap/skybox stay out of scope; tiles authored here but TileMap/map consumption is **maps-zones**; runtime-theme unification deferred.
- Build `tools/asset-2d-forge/intake2d.mjs` cloning `tools/asset-forge/intake.mjs`: validate source+render-type against `render-spec.json` → snapshot `catalog-manifest.json` → copy into correct `game-client/assets/<subdir>/` (+ generate/verify `.import` sidecar) → append stamped entry via `writeManifestAtomic` (reuse `tools/asset-forge/lib/manifest.mjs`) → run `scripts/check_asset_manifest.mjs` → **roll back to exact pre-write bytes on any failure**.
- **Single-path option-object API**: `intake2d({ src, key, render, license, source, tileSize?, patchMargins?, frame?/frames?/atlas?, previewHashOf?, dryRun })`. No positional args, no boolean-flag branching (`.cursor/rules/01-apis-and-constructors.mdc`).
- Enforce codegen boundary: reject reserved-namespace keys; refuse to write anywhere except `catalog-manifest.json`.
- Tests in `tools/asset-2d-forge/tests/`: dry-run emits expected entry; tileset-without-tileSize aborts byte-identical; reserved-namespace key aborts; happy path leaves gate green.

**Verification (evidence):** run the test suite → all pass; `node scripts/check_asset_manifest.mjs` exit 0; forced-failure run leaves `git diff catalog-manifest.json` empty (rollback proven).

**Quality gate:** implement → run tests + gate (evidence above) → independent adversarial review of the Phase-1 diff (fresh subagent / `/code-review`) → refactor (kill duplication vs `intake.mjs`, dead code, over-defensiveness) → re-run tests + gate green.

---

### Phase 2 — Seed the icon library and cover real UI ids
**Tasks**
- Source CC0 icons (Kenney / game-icons style) for the ids the UI already references: items `basic_sword, magic_staff, great_bow, potion_minor, leather_armor, iron_ore`; skills `power_strike, iron_skin` (+ rest of `SkillsById`); HUD glyphs (hp/mp/currency/ability-slot).
- Run each through `intake2d.mjs` → `icon:*` image entries (tier:seed, CC0, license+source stamped) landing in `game-client/assets/icons/` with committed `.import` sidecars.
- Add a **coverage test**: every id in `MetaIds.ItemsById` + `SkillsById` has a matching `icon:*` key — fails on any unmapped id.

**Verification:** gate green; coverage test passes; storybook eyeball — `buildImage` renders every new `icon:*` without console errors (headless screenshot via claude-in-chrome or manual).

**Quality gate:** implement → verify (gate + coverage test + storybook screenshot) → adversarial diff review → refactor → re-verify.

---

### Phase 3 — Seed tileset + ninepatch + spritesheet; wire storybook atlas-JSON path
**Tasks**
- Author more `tileset:*` (expand beyond `tileset:dungeon`) and real ninepatch `ui:*` panels (augment the empty placeholder `assets/ui/main.tres`; keep `theme:main_ui` gate-valid with fresh `preview`+`previewHashOf` so baked-preview staleness rule F passes) via the forge.
- Add ≥1 **atlas-shaped** spritesheet entry to exercise the third `oneOf` shape.
- Wire the storybook atlas-JSON branch (`index.html` L1115) so atlas-shaped entries render; extract the atlas parser into a testable unit if practical (zero-dependency, no bundler).

**Verification:** gate green; storybook renders tileset grid, ninepatch 9-slice, theme baked-preview, AND the atlas spritesheet (previously unsupported) — headless screenshot; if parser extracted, a node/jest test asserts frame-rect parsing.

**Quality gate:** implement → verify → adversarial diff review → refactor → re-verify.

---

### Phase 4 — Client consumption: catalog loader + icon binding in meta-UI  *(dependsOn: registry-binding)*
**Tasks**
- Consume registry-binding's `CatalogLoader` (`catalog-manifest.json` key → `Texture2D`, honoring `.import`). If registry-binding hasn't landed, ship a **minimal icon-scoped loader behind the same interface** (flagged temporary) — do not duplicate logic.
- Add client-side id→`icon:*` mapping (in `Catalog.cs`/`MetaIds.cs` or a Godot resource), keeping icon keys decoupled from reserved `item:*`.
- Wire `SkillTile.cs` + `InventoryTile.cs` to add a `TextureRect` resolving the mapped `icon:*` — fill the existing icon-shaped slots in `SkillsPanel`/`InventoryPanel`.

**Verification:** headless Godot/dotnet build passes with new `.import` sidecars; a headless probe loads a known `icon:*` key and asserts non-null `Texture2D`; screenshot of `SkillsPanel`/`InventoryPanel` showing rendered icons (evidence the orphaned icons are consumed).

**Quality gate:** implement → verify (build + probe + screenshot) → adversarial diff review → refactor → re-verify.

---

### Phase 5 — Gate integration, docs, backlog reconcile
**Tasks**
- Fold the icon-coverage check into the standing gate path (precheck) so 2D regressions fail CI.
- Document the 2D forge (`intake2d` options, catalog-only write rule) in `docs/`.
- **Flag, don't fix**, the F-002 open-vs-implemented status discrepancy for the release manager; update `MEMORY.md`.
- Run Gate 1 (`precheck.sh`) end-to-end.

**Verification:** `check_asset_manifest.mjs` + all new tests green; Gate 1 `precheck.sh` exit 0; full storybook pass; docs rendered.

**Quality gate:** implement → verify → adversarial diff review → refactor → re-verify.

---

### Dependencies
- **dependsOn: `registry-binding`** — only Phase 4's client key→`Texture2D` consumption. Phases 1–3 (authoring) have no cross-domain dependency. A minimal in-scope loader is the fallback if registry-binding lags.
- **maps-zones depends on THIS** (tiles underpin maps) — not the reverse; TileMap/map wiring is explicitly out of scope here.

### Shared infra touched
`catalog-manifest.json` (sole 2D sink), `render-spec.json` (read-only contract), `check_asset_manifest.mjs` (gate), `asset-storybook/index.html` (preview + atlas wiring), `asset-forge/lib/manifest.mjs` (atomic writer reuse), registry-binding `CatalogLoader` (consumption path).

### Constraints honored
Server-authoritative (2D is client-only, off the codegen contract — nothing added to `manifest.json`/`asset-keys.json`); single-path option-object APIs; every entry satisfies its render-type `require[]`; keyspaces stay disjoint (rule G); no reserved-namespace reuse (rule H); zero-dependency self-contained previewer; CC0/license tiering + committed `.import` sidecars; trunk-based via claimed worktree; **per-phase quality gate** on every phase.

### Definition of done
1. `tools/asset-2d-forge/intake2d.mjs` lands 2D assets transactionally (validate→copy→append→gate→rollback) with a passing test suite. 2. Icon library covers every `ItemsById`/`SkillsById` id (coverage test enforces it). 3. Tileset, ninepatch, theme, and atlas-spritesheet all render in storybook (atlas path no longer stubbed). 4. `SkillTile`/`InventoryTile` render real icons via the catalog loader — proven by a headless build + probe + screenshot. 5. Gate + Gate 1 precheck green; docs updated; F-002 discrepancy flagged. Every phase passed implement→verify→review→refactor→re-verify.

---
## Adversarial review findings

**[high]** Phase 4 verification ('headless Godot/dotnet build passes'; 'headless probe loads a known icon:* key and asserts non-null Texture2D') assumes a build harness that DOES NOT EXIST in the repo. game-client IS a real Godot C# project (project.godot present) but there is no Makefile, no CI build step, no `godot --headless` invocation anywhere, and no evidence the Godot binary or .NET SDK is available in this environment. Per the repo's own 'evidence before done' rule, this verification cannot be satisfied as written.

→ _fix:_ Add an explicit Phase-4 prerequisite task: stand up / verify the headless build harness — locate or install the Godot binary, run `godot --headless --import` then a `godot --headless`-driven C# probe scene that resolves an icon:* key to a Texture2D and exits non-zero on null. Gate the phase on Godot availability; if unavailable, downgrade the claim to 'unverifiable' explicitly rather than asserting a green build.

**[high]** Generating Godot .import sidecars from a Node forge is unsound. A real .import (seen at assets/icons/*.svg.import) carries a Godot-generated `uid://`, a content-hash-keyed imported path, and `dest_files` — all produced by Godot's importer, not hand-writable. A node-synthesized sidecar will mismatch (Godot re-imports anyway, or uid collisions occur), so the 'forge generates/verifies sidecars' mitigation understates the problem.

→ _fix:_ Do NOT have the forge synthesize .import. After copying the PNG, run `godot --headless --import` to let Godot generate the sidecar, then commit it. This binds Phases 2–4 to the Godot binary — surface that as a hard dependency, not a mitigation footnote.

**[medium]** The Phase-2 coverage test targets the wrong source of truth and cites a wrong path. Ids do NOT live at `MetaIds.ItemsById` — they are nested under `MetaIds.Catalog.ItemsById` / `MetaIds.Catalog.SkillsById`. More importantly MetaIds.cs is (per its own docstring) a HAND-MIRROR of the canonical machine-readable `contracts/content/items.json` + `contracts/content/skills.json`. A Node/jest test regex-parsing C# is brittle and validates the mirror, not the authority.

→ _fix:_ Drive the coverage test from `contracts/content/items.json` and `contracts/content/skills.json` (authoritative JSON). Optionally add a second assertion that MetaIds.cs stays in sync with those files, or drop the C# parse entirely.

**[medium]** Phase 5 'fold the icon-coverage check into precheck.sh' and 'Run Gate 1 (precheck.sh)' reference a script that is NOT in the repo. precheck.sh is owned by the ps-release-workflow toolkit (invoked by /ps-release-workflow-ship), not a repo file you can edit to add a repo-specific check.

→ _fix:_ Wire the coverage check into repo-owned infra — extend `scripts/check_asset_manifest.mjs` (already the standing gate), or `scripts/test_all.sh`, or a `scripts/` companion. Gate 1's precheck will pick it up only if it shells those; don't assume you can edit precheck.sh.

**[medium]** Phase 3 folds authoring of a real ninepatch/theme `.tres` + a FRESH baked preview into the Node forge, but a Node forge cannot RENDER a Godot Theme to produce the preview PNG that rule F (baked-preview staleness: preview mtime > source mtime) requires. Baking is Godot-editor / godot-headless work. The existing theme:main_ui is a 'baked preview demo' placeholder; augmenting it correctly is not a node job.

→ _fix:_ Author the .tres + baked preview via Godot (or hand-author the preview PNG and stamp its mtime), and have the forge only VALIDATE/stamp the entry — never claim to 'bake'. Keep the runtime-theme unification deferred as already noted.

**[low]** 'Clone intake.mjs' oversells reuse. intake.mjs writes to manifest.json (codegen/driftGated) with hardcoded kind:character/tier:bespoke and validates via validateGlb (gltf-transform, glb-only) — none of which applies to 2D. Only lib/manifest.mjs (atomic writer) and the transactional snapshot→write→gate→rollback SHAPE are reusable; the validator is net-new.

→ _fix:_ Reword Phase 1: reuse lib/manifest.mjs + the rollback pattern; write a NEW render-spec-driven validator (require[] for image/tileset/ninepatch/spritesheet). Do not reuse validate.mjs.

**[low]** Phase 4's fallback 'minimal icon-scoped loader behind the SAME interface' requires registry-binding to have DEFINED the key→Texture2D interface, even if unimplemented. If that contract isn't published, the fallback can't conform and will be silently re-worked later.

→ _fix:_ Coordinate/lock the CatalogLoader interface signature with registry-binding before Phase 4 starts, independent of its implementation landing.

**[low]** effortEstimate L likely under-scoped toward XL: Godot headless toolchain bring-up, correct .import generation, Godot theme baking, storybook atlas-JSON wiring, a new forge + new validator, plus client binding across 5 phases.

→ _fix:_ Re-estimate to L/XL and front-load the Godot-toolchain risk in Phase 1 rather than discovering it in Phase 4.