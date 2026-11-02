# Simplify Atlas Web: One Read-Only Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify Atlas web by eliminating 11 legacy studio write routes and the studio snapshot system, moving boss, road, and structure scale clamps into `scripts/validate_studio_hierarchy.py --check` wired into `scripts/precheck.sh`, making read-only vs editable mode unmistakable across UI hosts, and keeping Map Builder and review-queue write routes intact on the edit host.

**Architecture:** Maintain a single web codebase (`scripts/catalog_explorer_web.py` + `scripts/atlas_world_web/routes.py`) serving both the read-only cluster deployment (`atlas-world.joymify.local.com`) and the local edit host (`atlas-edit.joymify.local.com:8788`). Remove 11 hard-coded pilot-map mutation routes and studio snapshot files while preserving the 3 active write route groups (`/api/map-builder/*`, `/api/review-queue/asset-verdicts`, `/api/review-queue/work-orders`). World content edits transition to direct agent file editing protected by deterministic gate validation in Gate 1 (`precheck.sh`).

**Tech Stack:** Python 3.11+ (`http.server`, `unittest`), Node.js 20+ (`node:test`, `node:assert/strict`), Vanilla ES6 JavaScript / HTML5 / CSS3, Shell scripting (`bash`).

**Spec:** `.claude/refined_backlog/F-169-simplify-atlas-web-one-read-only-page-ag/spec.md`

## Global Constraints

- **Single Program Architecture:** Retain `scripts/catalog_explorer_web.py` as the single web server engine; do not fork into separate services.
- **Protected Write Routes (KEEP):** Preserve `/api/map-builder/*` (with DELETE), `/api/review-queue/asset-verdicts`, and `/api/review-queue/work-orders` in `scripts/atlas_world_web/routes.py`.
- **R0 Route Deletion Gate:** Confirm the exact 11 `do_POST` studio route deletions from `scripts/catalog_explorer_web.py:1957-1992` and studio snapshot deletion with the owner before applying code deletions.
- **Scale Clamps Gated:** Enforce boss height clamp `[7.35, 40.0]` m, pilot map highway width `[3.5, 12.0]` m, east spur width `[2.5, 8.0]` m, watchtower structure `[-35.0, 35.0]` m / radius `[2.5, 7.0]` m / upper floor `[2.2, 4.5]` m, and crystal cave coords `[-35.0, 35.0]` m / radius `[2.8, 7.5]` m in `scripts/validate_studio_hierarchy.py --check` via Gate 1 (`scripts/precheck.sh`).
- **One Undo Per Surface:** Drop the studio snapshot system (`build/studio_snapshots/*`); rely solely on Map Builder's independent undo system (`atelier/map-builder/lib/snapshots.mjs`).
- **Unmistakable UI Mode:** Topbar and footer must render `Read-only · <release> · <sha7>` on release hosts vs `Editable · ${location.host || 'local'}` on edit hosts.
- **Precheck Cleanliness:** All changes must pass `bash scripts/precheck.sh` cleanly with zero regressions.

---

### Task 1: Route Evidence List & Owner Confirmation Gate (R0 before deletion)

**Files:**
- Create/Verify: `.claude/refined_backlog/F-169-simplify-atlas-web-one-read-only-page-ag/route-evidence.md`
- Test: `scripts/tests/route-evidence.test.mjs`

**Interfaces:**
- Consumes: `scripts/catalog_explorer_web.py:1957-1992`, `scripts/atlas_world_web/routes.py:133-137`, `atelier/atlas-world-panels/`, and git history analysis.
- Produces: Committed route evidence markdown file documenting all 14 HTTP write routes with exact callers and explicit `KEEP` (3) / `REMOVE` (11) decisions; explicit Owner Confirmation approval before proceeding to Task 3.

```javascript test:scripts/tests/route-evidence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_PATH = path.join(ROOT, '.claude/refined_backlog/F-169-simplify-atlas-web-one-read-only-page-ag/route-evidence.md');

test('route-evidence.md exists and documents all 14 write routes with explicit dispositions', () => {
  assert.ok(existsSync(EVIDENCE_PATH), 'route-evidence.md must exist in the backlog directory');
  const content = readFileSync(EVIDENCE_PATH, 'utf8');

  // Verify KEEP routes (3 groups)
  assert.match(content, /\/api\/map-builder\/\*[\s\S]*?\*\*KEEP\*\*/);
  assert.match(content, /\/api\/review-queue\/asset-verdicts[\s\S]*?\*\*KEEP\*\*/);
  assert.match(content, /\/api\/review-queue\/work-orders[\s\S]*?\*\*KEEP\*\*/);

  // Verify REMOVE routes (11 routes)
  const removeRoutes = [
    '/api/rebuild',
    '/api/sim',
    '/api/review-queue/verdict',
    '/api/palette/toggle-asset',
    '/api/studio/undo',
    '/api/studio/ai-edit',
    '/api/map/update-structure',
    '/api/studio/launch-3d',
    '/api/studio/rationale/update',
    '/api/studio/generate-children',
    '/api/studio/map-layers',
  ];

  for (const r of removeRoutes) {
    const pattern = new RegExp(`${r.replace(/\//g, '\\/').replace(/\*/g, '\\*')}[\\s\\S]*?\\*\\*REMOVE\\*\\*`);
    assert.match(content, pattern, `Expected route ${r} to be documented and marked REMOVE`);
  }

  // Count total decisions in table
  const keepMatches = content.match(/\|\s*\*\*KEEP\*\*\s*\|/g) || [];
  const removeMatches = content.match(/\|\s*\*\*REMOVE\*\*\s*\|/g) || [];
  assert.equal(keepMatches.length, 3, 'Expected exactly 3 KEEP route entries in evidence table');
  assert.equal(removeMatches.length, 11, 'Expected exactly 11 REMOVE route entries in evidence table');
});
```

Verify-Cmd: `node scripts/tests/route-evidence.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/route-evidence.test.mjs` with the pre-registered acceptance test code above.

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/tests/route-evidence.test.mjs`
Expected: PASS if `route-evidence.md` is already in place; if missing or incomplete, FAIL with assertion failure on missing route entries.

- [ ] **Step 3: Verify and finalize `route-evidence.md`**

Ensure `.claude/refined_backlog/F-169-simplify-atlas-web-one-read-only-page-ag/route-evidence.md` contains the full 14-route matrix, citations, and explicit KEEP/REMOVE dispositions.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/tests/route-evidence.test.mjs`
Expected: PASS (all 14 routes categorized: 3 KEEP, 11 REMOVE).

- [ ] **Step 5: Update README & Documentation**

Document in the task summary that route evidence is established and verified.

- [ ] **Step 6: Commit**

```bash
git add .claude/refined_backlog/F-169-simplify-atlas-web-one-read-only-page-ag/route-evidence.md scripts/tests/route-evidence.test.mjs
git commit -m "docs(F-169): record and test studio write route evidence list"
```

- [ ] **Step 7: Phase gate & Owner Confirmation (R0)**

Verify Owner Confirmation has been obtained for the 11 `REMOVE` routes before proceeding to Task 3 deletions.

---

### Task 2: Move Size Clamps into `scripts/validate_studio_hierarchy.py --check` & Wire Explicit `scripts/precheck.sh` Section

**Files:**
- Modify: `scripts/validate_studio_hierarchy.py:189-261,500-516,710-745`
- Modify: `tests/test_validate_studio_hierarchy.py:163-170`
- Modify: `scripts/precheck.sh:263-271,445`

**Interfaces:**
- Consumes: Scale clamp laws from `catalog_explorer_web.py:1143-1149,1380-1412`, `contracts/content/mobs.json`, `content/maps/freja-south-gate.json`, `content/studio/world_history_and_concept.json`.
- Produces: Exported `boss_height_and_scale(take: dict) -> tuple[float, float]` in `scripts.validate_studio_hierarchy`, static scale clamp validation in `validate_studio_directory()`, and explicit `studio_hierarchy()` gate in `scripts/precheck.sh`.

```python test:tests/test_validate_studio_hierarchy.py
    def test_approve_path_never_writes_a_boss_below_the_law(self) -> None:
        from scripts.validate_studio_hierarchy import boss_height_and_scale

        self.assertEqual(boss_height_and_scale({"heightM": 2.1, "visualScale": 1.22}), (7.35, 4.27))
        self.assertEqual(boss_height_and_scale({}), (7.35, 4.27))
        self.assertEqual(boss_height_and_scale({"heightM": 9.0, "visualScale": 5.0}), (9.0, 5.0))
        self.assertEqual(boss_height_and_scale({"heightM": 99}), (40.0, 23.26))

    def test_validate_studio_hierarchy_rejects_boss_height_out_of_clamp(self) -> None:
        from scripts.validate_studio_hierarchy import validate_studio_directory
        import tempfile, shutil

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            shutil.copytree(DEFAULT_STUDIO_DIR, tmp_path / "studio")
            whc_file = tmp_path / "studio" / "world_history_and_concept.json"
            whc_data = json.loads(whc_file.read_text())
            whc_data["character_scale_law"]["boss_scale_law"]["min_height_meters"] = 45.0
            whc_file.write_text(json.dumps(whc_data, indent=2))

            errors = validate_studio_directory(tmp_path / "studio")
            self.assertTrue(any("boss_scale_law.min_height_meters must be within [7.35, 40.0]" in e for e in errors), f"Expected clamp error, got {errors}")

    def test_validate_studio_hierarchy_rejects_pilot_map_road_out_of_clamp(self) -> None:
        from scripts.validate_studio_hierarchy import _validate_map_scale_clamps

        # Violate prontera_south_highway width (< 3.5m or > 12.0m)
        bad_map = {
            "routes": [{"id": "prontera_south_highway", "width": 14.5}],
            "structures": []
        }
        errors = []
        _validate_map_scale_clamps(bad_map, "content/maps/freja-south-gate.json", errors)
        self.assertTrue(any("prontera_south_highway" in e and "[3.5, 12.0]" in e for e in errors), f"Expected road clamp error, got {errors}")

    def test_validate_studio_hierarchy_rejects_pilot_map_structure_out_of_clamp(self) -> None:
        from scripts.validate_studio_hierarchy import _validate_map_scale_clamps

        # Violate freja_west_watchtower_01 radius (< 2.5m or > 7.0m)
        bad_map = {
            "routes": [],
            "structures": [{"id": "freja_west_watchtower_01", "x": 0.0, "z": 0.0, "radius": 9.0, "upperFloorHeight": 3.0}]
        }
        errors = []
        _validate_map_scale_clamps(bad_map, "content/maps/freja-south-gate.json", errors)
        self.assertTrue(any("freja_west_watchtower_01.radius" in e and "[2.5, 7.0]" in e for e in errors), f"Expected structure clamp error, got {errors}")
```

Verify-Cmd: `python3 -m unittest tests.test_validate_studio_hierarchy`

- [ ] **Step 1: Write the failing test**

Update `tests/test_validate_studio_hierarchy.py` to import `boss_height_and_scale` from `scripts.validate_studio_hierarchy` instead of `scripts.catalog_explorer_web`, and add test methods for boss height clamp `[7.35, 40.0]`, road width clamps, and structure bounds.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests.test_validate_studio_hierarchy`
Expected: FAIL with `ImportError: cannot import name 'boss_height_and_scale' from 'scripts.validate_studio_hierarchy'` or missing clamp assertion failure.

- [ ] **Step 3: Implement minimal code in `scripts/validate_studio_hierarchy.py` and `scripts/precheck.sh`**

In `scripts/validate_studio_hierarchy.py`:
1. Define `boss_height_and_scale(take: dict) -> tuple[float, float]`:
```python
def boss_height_and_scale(take: dict) -> tuple[float, float]:
    """Boss height clamped to the 7.35-40 m law; scale follows when clamped."""
    raw_height = float(take.get("heightM") or 7.35)
    height = max(7.35, min(40.0, raw_height))
    if height != raw_height or not take.get("visualScale"):
        return height, round(height / 1.72, 2)
    return height, float(take["visualScale"])
```
2. Update `_validate_character_scale_law()` to enforce `7.35 <= boss_height <= 40.0`:
```python
        boss_height = boss_law.get("min_height_meters")
        if not isinstance(boss_height, (int, float)) or boss_height < 7.35 or boss_height > 40.0:
            errors.append(
                f"{source_label}: boss_scale_law.min_height_meters must be within [7.35, 40.0], got {boss_height!r}"
            )
```
3. Implement `_validate_map_scale_clamps(map_doc: dict, map_path: str, errors: list[str])` to validate:
- `prontera_south_highway`: `3.5 <= width <= 12.0`
- `watchtower_east_spur`: `2.5 <= width <= 8.0`
- `freja_west_watchtower_01`:
  - `x` and `z` in `[-35.0, 35.0]`
  - `2.5 <= radius <= 7.0`
  - `2.2 <= upperFloorHeight <= 4.5`
- `freja_east_crystal_cave_01`:
  - `x` and `z` in `[-35.0, 35.0]`
  - `2.8 <= radius <= 7.5`
4. Also check `contracts/content/mobs.json`: for any mob where `isMvp` is true or `rank` is boss/S/A, if `heightM` is present, verify `7.35 <= heightM <= 40.0`.
5. Call `_validate_map_scale_clamps` from `validate_studio_directory` on `content/maps/freja-south-gate.json` if it exists.

In `scripts/precheck.sh`:
Add the explicit section:
```bash
# Studio hierarchy, 5-pillar completeness, and scale clamps (INV-01..07)
studio_hierarchy() {
  python3 "$REPO_ROOT/scripts/validate_studio_hierarchy.py" --check
}
```
And wire it into Gate 1 execution around line 445:
```bash
run_section "studio hierarchy & scale clamps (INV-01..07)" studio_hierarchy
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests.test_validate_studio_hierarchy`
Expected: PASS (all tests pass).

- [ ] **Step 5: Update README & Documentation**

Add note to `README.md` that boss, road, and structure scale clamps are statically verified by `scripts/validate_studio_hierarchy.py --check` in Gate 1.

- [ ] **Step 6: Commit**

```bash
git add scripts/validate_studio_hierarchy.py tests/test_validate_studio_hierarchy.py scripts/precheck.sh README.md
git commit -m "feat(F-169): move size clamps into validate_studio_hierarchy and wire into precheck"
```

- [ ] **Step 7: Phase gate**

Verify `python3 -m unittest tests.test_validate_studio_hierarchy` passes cleanly; review diff for precision.

---

### Task 3: Remove Confirmed `do_POST` Studio Routes, Drop Studio Snapshot System, & Clean Up Frontend Callers + Tests

**Files:**
- Modify: `scripts/catalog_explorer_web.py`
  - Remove `save_studio_map_feature_layers_patch` (:237-252)
  - Remove `studioSnapshots` from `build_full_bundle` (:750)
  - Remove snapshot helpers `list_studio_snapshots`, `create_studio_snapshot`, `undo_latest_snapshot` (:760-824)
  - Remove unused pilot write handlers: `update_studio_rationale`, `generate_studio_children`, `sync_palettes_into_pilot_map`, `record_ai_agent_log`, `apply_review_verdict`, `boss_height_and_scale`, `_apply_review_verdict`, `toggle_palette_asset`, `update_map_structure`, `_update_map_structure`, `apply_ai_studio_edit`, `_apply_ai_studio_edit`, `launch_3d_preview`, `run_balance_sim` (:896-1792)
  - Remove the 11 `if parsed.path == ...` branches in `do_POST` (:1956-1992)
- Modify: `scripts/atlas_world_web/frontend/01_shell_and_styles.html:2481-2500,2581-2587`
  - Remove topbar `Rebuild SQLite` and `Run Balance Sim` buttons
  - Update `/* read-only controls */` CSS rule to:
    ```css
    /* read-only controls */
    body[data-read-only] [data-write-control] { display: none !important; }
    /* end read-only controls */
    ```
- Modify: `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js:773-815,982-1093,1115,1137,1157,1176`
  - Remove deleted helper functions: `rebuildDb`, `triggerBalanceSim`, `submitStudioRationaleUpdate`, `saveStudioRationaleForm`, `toggleStudioQualityPillar`, `triggerStudioChildGeneration`, `undoStudioSnapshotAction`, and unused event handlers.
- Modify: `scripts/atlas_world_web/frontend/02b_cartography_pipeline.js:714-745` & `06_world_and_submap_atlas.js:1156`
  - Retain `saveIncrementalComposableFeaturesToDisk` in-memory state updates for V-16 probe compatibility, but remove the `atlasWrite('/api/studio/map-layers', ...)` HTTP call; remove the disk save button in `06_world_and_submap_atlas.js`.
- Modify: `scripts/atlas_world_web/frontend/07_studio_perspectives_views.js:2062-2191,2206-2242,2276-2308,2352,2486-2487,2519-2525` & `08_catalog_and_3d_modal_views.js:16,62,80-81,2732`
  - Remove deleted callers: `submitReviewVerdict`, `togglePaletteAsset`, `undoStudioSnapshot`, `launch3dClient`, `runAiStudioAgent`, `applyInteractiveMapStructure` and associated UI buttons/inputs.
- Modify: `scripts/tests/atlas-web-read-only.test.mjs:14-20,57-63`
  - Update `writeRoutes()` assertions: remaining write routes are `/api/review-queue/asset-verdicts`, `/api/review-queue/work-orders`, and `/api/map-builder/x`, with `routes.length >= 3`.
- Modify: `scripts/tests/atlas-web-frontend-read-only.test.mjs:14-41,80-82`
  - Update tests to verify no removed routes appear in frontend slices and `body[data-read-only] [data-write-control]` hides panel write controls.
- Modify: `tests/test_studio_web_perspectives.py:101-102,129-215,5433-5435` & `tests/test_atlas_world_web.py:235-276`
  - Remove obsolete test methods calling deleted web handlers while preserving hierarchy and governance tests.

**Interfaces:**
- Consumes: Confirmed REMOVE route list from Task 1.
- Produces: Clean, simplified web server with zero legacy pilot write endpoints and 0 snapshot files; single undo system in Map Builder; clean frontend slices.

```javascript test:scripts/tests/atlas-web-read-only.test.mjs
test('write route list is derived and non-trivial', () => {
  const routes = writeRoutes();
  assert.ok(!routes.includes('/api/rebuild'), '/api/rebuild must be removed');
  assert.ok(!routes.includes('/api/sim'), '/api/sim must be removed');
  assert.ok(!routes.includes('/api/studio/undo'), '/api/studio/undo must be removed');
  assert.ok(routes.includes('/api/review-queue/asset-verdicts'));
  assert.ok(routes.includes('/api/review-queue/work-orders'));
  assert.ok(routes.includes('/api/map-builder/x'));
  assert.ok(routes.length >= 3, `Expected at least 3 active write routes, got ${routes.length}`);
});
```

```javascript test:scripts/tests/atlas-web-frontend-read-only.test.mjs
test('no removed studio write routes appear anywhere in frontend slices', () => {
  const removedRoutes = [
    '/api/rebuild',
    '/api/sim',
    '/api/review-queue/verdict',
    '/api/palette/toggle-asset',
    '/api/studio/undo',
    '/api/studio/ai-edit',
    '/api/map/update-structure',
    '/api/studio/launch-3d',
    '/api/studio/rationale/update',
    '/api/studio/generate-children',
    '/api/studio/map-layers',
  ];
  for (const [file, sliceContent] of slices) {
    for (const route of removedRoutes) {
      assert.ok(!sliceContent.includes(route), `Frontend slice ${file} still references deleted route ${route}`);
    }
  }
});
```

Verify-Cmd: `node --test scripts/tests/atlas-web-*.test.mjs atelier/atlas-world-panels/tests/*.test.mjs && python3 -m unittest tests.test_atlas_world_web tests.test_studio_web_perspectives`

- [ ] **Step 1: Write the failing test**

Update `scripts/tests/atlas-web-read-only.test.mjs` and `scripts/tests/atlas-web-frontend-read-only.test.mjs` with the updated route assertions and checks for removed routes.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/atlas-web-read-only.test.mjs scripts/tests/atlas-web-frontend-read-only.test.mjs`
Expected: FAIL because `/api/rebuild` and other routes are still present in `catalog_explorer_web.py` and frontend slices.

- [ ] **Step 3: Remove dead routes and clean up frontend slices and tests**

1. In `scripts/catalog_explorer_web.py`:
- Remove `save_studio_map_feature_layers_patch` (lines 237-252)
- In `build_full_bundle()` (line 750), remove `"studioSnapshots": list_studio_snapshots()`
- Remove `list_studio_snapshots`, `create_studio_snapshot`, `undo_latest_snapshot` (lines 760-824)
- Remove `update_studio_rationale`, `generate_studio_children`, `sync_palettes_into_pilot_map`, `record_ai_agent_log`, `apply_review_verdict`, `boss_height_and_scale`, `_apply_review_verdict`, `toggle_palette_asset`, `update_map_structure`, `_update_map_structure`, `apply_ai_studio_edit`, `_apply_ai_studio_edit`, `launch_3d_preview`, `run_balance_sim` (lines 896-1792)
- In `do_POST` (lines 1956-1992), remove the 11 route handling branches (`/api/rebuild`, `/api/sim`, `/api/review-queue/verdict`, `/api/palette/toggle-asset`, `/api/studio/undo`, `/api/studio/ai-edit`, `/api/map/update-structure`, `/api/studio/launch-3d`, `/api/studio/rationale/update`, `/api/studio/generate-children`, `/api/studio/map-layers`).

2. In `scripts/atlas_world_web/frontend/01_shell_and_styles.html`:
- Remove buttons for `rebuildDb()` and `triggerBalanceSim()` (lines 2581-2587).
- Update the read-only stylesheet section (lines 2481-2500) to simplify to:
```css
    /* read-only controls */
    body[data-read-only] [data-write-control] { display: none !important; }
    /* end read-only controls */
```

3. In `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js`:
- Remove `rebuildDb`, `triggerBalanceSim`, `submitStudioRationaleUpdate`, `saveStudioRationaleForm`, `toggleStudioQualityPillar`, `triggerStudioChildGeneration`, `undoStudioSnapshotAction` and their bindings.

4. In `scripts/atlas_world_web/frontend/02b_cartography_pipeline.js`:
- In `saveIncrementalComposableFeaturesToDisk`, retain the local in-memory update on `window.atlasComposableLayers` and UI toast, but remove the `atlasWrite('/api/studio/map-layers', ...)` call. Remove the save button in `06_world_and_submap_atlas.js:1156`.

5. In `scripts/atlas_world_web/frontend/07_studio_perspectives_views.js` & `08_catalog_and_3d_modal_views.js`:
- Remove `submitReviewVerdict`, `togglePaletteAsset`, `undoStudioSnapshot`, `launch3dClient`, `runAiStudioAgent`, `applyInteractiveMapStructure` and their associated DOM elements.

6. In `tests/test_studio_web_perspectives.py`:
- Remove `test_rationale_update_blocks_canon_when_parent_not_canon_or_checklist_incomplete`, `test_rationale_update_and_undo_snapshot_roundtrip`, `test_generate_children_enforces_canon_and_five_pillar_checklist_gate` (lines 129-215).
- Remove route assertions for `/api/studio/rationale/update` and `/api/studio/generate-children` (lines 101-102).
- Remove lines 5433-5435 testing `save_studio_map_feature_layers_patch`.

7. In `tests/test_atlas_world_web.py`:
- Remove `TestExplorerWritersUseTheSingleWriter` (lines 235-276) testing the deleted `web.apply_review_verdict`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/atlas-web-*.test.mjs atelier/atlas-world-panels/tests/*.test.mjs && python3 -m unittest tests.test_atlas_world_web tests.test_studio_web_perspectives`
Expected: PASS (all tests pass cleanly).

- [ ] **Step 5: Update README & Documentation**

Document removal of legacy studio routes and retirement of studio snapshot directory.

- [ ] **Step 6: Commit**

```bash
git add scripts/catalog_explorer_web.py scripts/atlas_world_web/frontend/ scripts/tests/ tests/
git commit -m "feat(F-169): remove dead studio write routes and clean up frontend callers"
```

- [ ] **Step 7: Phase gate**

Verify full suite: `node --test scripts/tests/atlas-web-*.test.mjs atelier/atlas-world-panels/tests/*.test.mjs` and Python tests pass.

---

### Task 4: Unmistakable Mode Indicator on Release Page vs Edit Host + UI Visual Verification

**Files:**
- Modify: `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js:33-60`
- Modify: `scripts/atlas_world_web/runtime.py:12`
- Modify: `scripts/tests/atlas-web-read-only.test.mjs`
- Modify: `scripts/tests/atlas-web-frontend-read-only.test.mjs`

**Interfaces:**
- Consumes: `/api/runtime` JSON endpoint response `{ readOnly: boolean, release: string | null, commit: string | null }`.
- Produces: Topbar `#topbarStatus` and footer `#sidebarVersion` rendering:
  - If `rt.readOnly`: `Read-only · <release> · <sha7>` (linked to `ATLAS_EDIT_URL`).
  - If `!rt.readOnly`: `Editable · ${location.host || 'local'}`.
  - Refusal message in `runtime.py:12` advising edit on `atlas-edit.joymify.local.com`.

```javascript test:scripts/tests/atlas-web-frontend-read-only.test.mjs
test('loadRuntime formats read-only badge with release/commit and editable badge with host', () => {
  const code = slices.find(([f]) => f.startsWith('02_state'))[1];
  assert.ok(code.includes('Read-only · ${rt.release} · ${String(rt.commit).slice(0, 7)}'), 'Must format read-only release status');
  assert.ok(code.includes('Editable · ${location.host || \'local\'}') || code.includes('Editable · ') && code.includes('location.host'), 'Must format editable status with host');
});
```

Verify-Cmd: `node --test scripts/tests/atlas-web-frontend-read-only.test.mjs scripts/tests/atlas-web-read-only.test.mjs`

- [ ] **Step 1: Write the failing test**

Add test to `scripts/tests/atlas-web-frontend-read-only.test.mjs` asserting that `loadRuntime()` handles both `readOnly: true` (formatting `Read-only · <release> · <sha7>`) and `readOnly: false` (formatting `Editable · <host>`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/atlas-web-frontend-read-only.test.mjs`
Expected: FAIL due to missing `Editable · ${location.host || 'local'}` in `02_state_and_composable_layers.js`.

- [ ] **Step 3: Implement mode rendering logic**

In `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js:33-60`:
```javascript
function renderVersionLine(text, isReadOnly = true) {
  const status = document.getElementById('topbarStatus');
  if (isReadOnly) {
    const link = document.createElement('a');
    link.href = ATLAS_EDIT_URL;
    link.textContent = text;
    status.replaceChildren(link);
  } else {
    status.textContent = text;
  }
  const footer = document.getElementById('sidebarVersion');
  if (footer) footer.textContent = text;
}

async function loadRuntime() {
  if (atlasIsReadOnly()) document.getElementById('topbarStatus').textContent = 'Loading release…';
  try {
    const res = await fetch('/api/runtime');
    if (res.status === 404) {
      if (atlasIsReadOnly()) {
        renderVersionLine('Version unknown', true);
      } else {
        renderVersionLine(`Editable · ${location.host || 'local'}`, false);
      }
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rt = await res.json();
    if (rt.readOnly) {
      renderVersionLine(
        rt.release && rt.commit
          ? `Read-only · ${rt.release} · ${String(rt.commit).slice(0, 7)}`
          : 'Version unknown',
        true
      );
    } else {
      renderVersionLine(`Editable · ${location.host || 'local'}`, false);
    }
  } catch {
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!local) document.body.setAttribute('data-read-only', '1');
    if (atlasIsReadOnly()) {
      renderVersionLine('Version unknown', true);
    } else {
      renderVersionLine(`Editable · ${location.host || 'local'}`, false);
    }
  }
}
```

Verify `scripts/atlas_world_web/runtime.py:12`:
`READ_ONLY_MESSAGE = "This is a read-only release page. Edit on atlas-edit.joymify.local.com."`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/atlas-web-frontend-read-only.test.mjs scripts/tests/atlas-web-read-only.test.mjs`
Expected: PASS.

- [ ] **Step 5: UI Visual Verification**

Execute UI visual verification:
1. Start server with `ATLAS_READ_ONLY=1 ATLAS_RELEASE=1.20 ATLAS_COMMIT=f169abc` and capture phone (`390x844`) and desktop (`1280x800`) screenshots using `node ~/.claude/skills/ui-visual-verify/shoot.mjs`.
2. Start server without read-only flag on local port and capture phone and desktop screenshots.
3. Call `read_file` on all 4 generated images to inspect badge alignment and scannability.
4. Record screenshots in verification report.

- [ ] **Step 6: Commit**

```bash
git add scripts/atlas_world_web/frontend/02_state_and_composable_layers.js scripts/atlas_world_web/runtime.py scripts/tests/
git commit -m "feat(F-169): unmistakable mode indicator on release page vs edit host"
```

- [ ] **Step 7: Phase gate**

Verify unit tests pass and screenshots confirm visual distinction.

---

### Task 5: Update `README.md` & Architecture Documentation

**Files:**
- Modify: `README.md`
- Modify: `atelier/atlas-world-panels/README.md`

**Interfaces:**
- Consumes: Single-program architecture, mode badges, removed studio write routes, and scale clamps validation.
- Produces: Updated repository and panel READMEs documenting the read-only cluster deployment vs edit host, Map Builder proxy, review-queue endpoints, and direct file editing gated by `scripts/validate_studio_hierarchy.py --check`.

```bash test:tests/check_docs.sh
node -e '
const fs = require("node:fs");
const assert = require("node:assert/strict");

const rootReadme = fs.readFileSync("README.md", "utf8");
assert.ok(rootReadme.includes("Read-only · <release> · <sha7>") || rootReadme.includes("Read-only ·"), "Root README must document Read-only mode badge");
assert.ok(rootReadme.includes("Editable ·"), "Root README must document Editable mode badge");
assert.ok(rootReadme.includes("validate_studio_hierarchy.py --check"), "Root README must document validate_studio_hierarchy check in Gate 1");
assert.ok(!rootReadme.includes("/api/rebuild"), "Root README must not reference deleted /api/rebuild");

const panelsReadme = fs.readFileSync("atelier/atlas-world-panels/README.md", "utf8");
assert.ok(panelsReadme.includes("review-queue"), "Panels README must describe active review-queue endpoints");
console.log("Docs check PASS");
'
```

Verify-Cmd: `node -e 'const fs = require("node:fs"); const assert = require("node:assert/strict"); const r = fs.readFileSync("README.md", "utf8"); assert.ok(r.includes("Read-only") && r.includes("validate_studio_hierarchy"));'`

- [ ] **Step 1: Write doc verification check**

Create or run doc verification assertion to verify README contains all required architecture changes.

- [ ] **Step 2: Run check to verify it fails**

Run: `node -e 'const fs = require("node:fs"); const assert = require("node:assert/strict"); const r = fs.readFileSync("README.md", "utf8"); assert.ok(r.includes("validate_studio_hierarchy.py --check"));'`
Expected: FAIL before update.

- [ ] **Step 3: Update `README.md` and `atelier/atlas-world-panels/README.md`**

Update `README.md` to document:
1. Single web program architecture: cluster serves read-only (`Read-only · <release> · <sha7>`), Mac host serves editable (`Editable · <host>`).
2. Map Builder proxy and review queue endpoints (`/api/map-builder/*`, `/api/review-queue/asset-verdicts`, `/api/review-queue/work-orders`) remain active on the edit host.
3. Content edits by autonomous agents happen directly on disk files, gated by `python3 scripts/validate_studio_hierarchy.py --check` in Gate 1 (`scripts/precheck.sh`).
4. Removal of dead pilot routes and retirement of studio snapshot system.

Update `atelier/atlas-world-panels/README.md` reflecting active review queue endpoints.

- [ ] **Step 4: Run check to verify it passes**

Run: `node -e 'const fs = require("node:fs"); const assert = require("node:assert/strict"); const r = fs.readFileSync("README.md", "utf8"); assert.ok(r.includes("Read-only") && r.includes("validate_studio_hierarchy.py --check"));'`
Expected: PASS.

- [ ] **Step 5: Verify formatting**

Check markdown rendering and scannability.

- [ ] **Step 6: Commit**

```bash
git add README.md atelier/atlas-world-panels/README.md
git commit -m "docs(F-169): update architecture and operational guide for read-only vs edit host"
```

- [ ] **Step 7: Phase gate**

Verify README updates are concise, scannable, and accurate.

---

### Task 6: Gate 1 (`psrw ship --deploy`), Live Cluster Proof, & `psrw promote --direct`

**Files:**
- Execute: `scripts/precheck.sh`
- Execute: `psrw ship --deploy`
- Verify: `https://atlas-world.joymify.local.com/api/runtime` and `403` write refusal
- Execute: `psrw promote --direct`

**Interfaces:**
- Consumes: All passing unit, integration, frontend, probe, and precheck suites.
- Produces: Deployed release 1.20 container image running on Joymify cluster with verified read-only enforcement; promoted release to `main`.

Verify-Cmd: `bash scripts/precheck.sh`

- [ ] **Step 1: Run Gate 1 locally**

```bash
bash scripts/precheck.sh
```
Expected: `RESULT: GATE 1 PASS — feature is ship-clean` (including the new `studio hierarchy & scale clamps (INV-01..07)` section).

- [ ] **Step 2: Ship and deploy release**

```bash
psrw ship --deploy | tee /tmp/f169-ship.log
```
Expected: Gate 1 passes, image builds and deploys to cluster, rollout completes.

- [ ] **Step 3: Live cluster verification**

1. Verify runtime status endpoint:
```bash
curl -s https://atlas-world.joymify.local.com/api/runtime
```
Expected: `{"readOnly":true,"release":"1.20","commit":"<sha>"}`

2. Verify write attempt returns 403 Forbidden:
```bash
curl -s -i -X POST -H "Content-Type: application/json" -d "{}" https://atlas-world.joymify.local.com/api/review-queue/asset-verdicts
```
Expected: `HTTP/1.1 403 Forbidden` with `"error": {"code": "read_only"}`.

3. Verify Map Builder Gate 2 integration passes:
```bash
node atelier/atlas-world-panels/tests/smoke/scenarios.mjs
```
Expected: All scenarios PASS.

- [ ] **Step 4: Promote release**

```bash
psrw promote --direct
```
Expected: Clean promotion of release/1.20 to `main`.

- [ ] **Step 5: Update README & Documentation**

Confirm version tags and deployment status in release log.

- [ ] **Step 6: Commit and fast-forward**

Verify working tree clean on `main`.

- [ ] **Step 7: Phase gate**

Final quality gate: cluster serving live 1.20 release with unmistakable mode indicator and verified write refusal.
