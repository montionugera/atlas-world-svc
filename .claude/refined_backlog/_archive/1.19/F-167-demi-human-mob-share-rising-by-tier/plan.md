# I-247 Upright Monster Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** High-tier dungeon enemies are designed as upright, intelligent monsters at the shares the owner asked for ("~ 30 % look like Demi-human especially high tier"), no dungeon boss is left as a nameless filler robot, and the atlas spawn list can filter to them while a gate proves the share per tier.

**Architecture:** A reviewable picks file drives one idempotent Python pass over the atlas JSON. A pure JS checker backs the `G-MOB-SHAPE` gate, which runs inside `npm test` in `scripts/`. The existing spawn matrix gets one toggle. No runtime, art or stat change.

**Tech Stack:** Python 3 stdlib, Node `node:test` + ajv, plain browser JS in `scripts/atlas_world_web/frontend/`, Playwright for the real-click check.

**Spec:** `.claude/idea_backlog/I-247-demi-human-mob-share-rising-by-tier/spec.md` (read it first; its tables are the brief for names, kin and states).

## Global Constraints

- Targets, in tagged rows: Monster 10 (8-12), Mini-Boss 20 (18-22), Raid 26 (24-28), MVP 33 (31-35). The script aims for exactly 10/20/26/33. The ranges bind the gate.
- `entity_type` in the JSON is `Monster` for the spec's "Normal" tier. Raid may be `Raid` or `RaidBoss`; normalise as the UI does.
- A row key is `dungeon_id/floor_id/index`. Never key by `npc_id`.
- Playable races: `human_demi_human`, `lunar`, `ogre_orc`, `dwarf`, `dark_lunar`, `furral`. These and `robotic` can never carry `body_plan`.
- `body_kin` → `race_key` is the spec's table, no others.
- `npc_id` 29001 stays exactly as it is.
- Only `name`, `race_key`, `race_badge`, `body_plan`, `body_kin` and strings holding an old name may change.
- `references/` is copyrighted: stage files by name, never `git add -A`. No hand commits on `release/1.19`; all work is in the claimed feature worktree.
- Do not stop the process on `:8788` (pid 44633, another session's).

## Corrections to the spec, found while planning (2026-11-01)

1. **181, not 180.** The spec's name shapes match 181 boss rows by naive regex; its table says 180. Task 1 prints them and tightens the regex until it matches the table, so an authored name is not treated as filler.
2. **Filler also sits in `race_badge`.** `Mini-Boss · B1 Keeper` matches the gate's `Keeper` shape. So every filler row, Steppe included, gets a derived badge `<Label> · <Tier>`, using Beast, Insect, Fish, Plant, Undead, Robotic and Normal, Mini-Boss, Raid, MVP. This follows the existing `Insect · Normal`.
3. **The matrix is capped and collapsed.** `displayRows = filteredRows.slice(0, 18)` would hide 71 of 89 rows, and `ATLAS_ENTITY_MATRIX_OPEN` defaults to false. With the toggle on, the cap is off and the matrix opens, including on reload from `shape=upright`.
4. **Off-Steppe authored robots.** The rule "an off-Steppe boss row is `robotic` and not on `keep_robotic`" also hits authored rows such as `Rooftop Apex`. These get a race through picks and keep their name, except the Baium rename. `62054` (authored, `dark_lunar`) is repaired the same way. `new_name` is therefore optional in a picks entry.
5. **Filler highlights drop the prefix.** 26 floors hold the name in `boss_tier_highlight` without `[MVP] ` or `[Mini-Boss] `. The script replaces both the full name and the prefix-stripped form.
6. **Rebadge by badge, not by name.** Two authored Pendulum Shaft rows (1F/2, 2F/1) keep badges `Mini-Boss · 1F Overseer` and `Mini-Boss · 2F Keeper`. Any row whose `race_badge` matches the filler regex is rebadged.
7. **`world_boss_spawn_radar` is a reference site.** 13 `boss_name` values are exact filler names, each with `dungeon_id` and `floor_id`, and the page shows them. The script updates them and the gate scans them.
8. **`boss_hierarchy_chains` holds no filler name.** Measured by the plan audit. There is nothing to rewrite, so the script instead exits 1 if any renamed old name appears there.
9. **Six MVP rows on Steppe catacombs are `dark_lunar`, not robotic** (`zone-catacomb-branded-bellows` and `zone-catacomb-apostate-dynamo`, B1-B3). They become `undead`, untagged, which matches what the generator gave catacomb floor mobs and frees a playable race.
10. **Status region.** `render()` rebuilds the matrix, so a `role="status"` node inside it is never announced. A stable screen-reader node in the shell carries the same text.
11. **`Royal Hive Overseer` (kiln-cellar B2) is the 181st regex hit** and is authored. It keeps its name.
12. **Playwright lives only in `client/react-client`.** `smoke/run.mjs` drives Chrome by hand, so it is not reusable here. The real-click script resolves Playwright from that package; run `npm ci` there first.

13. **Steppe is computed, not guessed.** A dungeon's continent comes from its `dungeon_id` matched to `zone_id` in `t_breadth_zone_directory`, then that zone's `continent_id`. The Steppe is the continent whose name starts `The Clockwork Steppe`.

---

### Task 1: Schema and the pass script

**Files:**
- Modify: `content/studio/schemas/t-shaped-world-atlas.schema.json` (`$defs.spawnRow`, line ~786)
- Create: `scripts/mob_body_plan_pass.py`
- Test: `scripts/tests/mob-body-plan-pass.test.mjs`

**Interfaces:**
- Produces: CLI `python3 scripts/mob_body_plan_pass.py [--atlas PATH] [--picks PATH] [--targets PATH] [--check]`. Exit 0 on success, 1 with one line per problem on stderr. `--check` validates and writes nothing.
- Produces: picks shape:
  ```json
  {
    "keep_robotic": ["zone-dungeon-kiln-cellar/B3/2"],
    "entries": [
      { "row": "zone-dungeon-x/B1/2", "new_name": "[Mini-Boss] Ash Hound Marshal", "race_key": "beast_animal_brute", "body_kin": "hound_kin" }
    ]
  }
  ```
  `new_name` and `body_kin` are optional. `row` is unique. `race_badge` is always derived.

- [ ] **Step 1: Measure and pin the filler regex.** Print every boss row matching the spec's shapes, per tier, and compare to the spec table (59/61/60). Tighten the regex until the counts match. Copy the final regex into both the script and Task 2 unchanged. Also round-trip the atlas: `json.loads` + `json.dumps(obj, ensure_ascii=False, indent=2) + "\n"` must equal the file bytes. If it does not, find the formatting that does before writing the script, because a noisy rewrite breaks R5 review.

- [ ] **Step 2: Add the schema fields.** In `$defs.spawnRow.properties`:
  ```json
  "body_plan": { "type": "string", "enum": ["upright_monster"] },
  "body_kin": { "type": "string", "enum": ["scale_kin", "hound_kin", "boar_kin", "mantis_kin", "beetle_kin", "tide_kin", "bark_kin", "bone_kin"] }
  ```

- [ ] **Step 3: Write the failing tests.** `scripts/tests/mob-body-plan-pass.test.mjs` builds a small atlas in a temp dir and runs the script with `execFileSync`. One test per requirement:
  - R1: a fixture meeting scaled targets passes. The target table is read from `--targets PATH` when given, so fixtures can use small numbers; the default is the Global Constraints values.
  - R2: eligible pool below a tier minimum exits 1 and the atlas file is byte-identical to before. Eligible means a row of that tier that is off the Steppe, not 29001, not `keep_robotic`, and not a playable race once picks are applied. Test the pool, not the tagged count.
  - R3: an entry with `race_key: robotic` or a playable race plus `body_kin` exits 1, also for `body_kin` mismatching the table.
  - R4: running twice gives identical bytes.
  - R5: deep-compare every row before and after; only the listed fields differ. Non-row fields only differ by the name substring.
  - R6: a `boss_tier_highlight` holding a filler name not covered by any entry exits 1.
  - Same filler name in two dungeons: each dungeon's strings get its own new name.
  - A `boss_tier_highlight` holding the prefix-stripped name, such as `Foo 3F Apostle Sovereign (MVP)`, gets the prefix-stripped new name.
  - A `world_boss_spawn_radar` `boss_name` matched by `dungeon_id` + `floor_id` + old name is updated, and a same-named entry for another dungeon is not.
  - A row with an authored name and badge `Mini-Boss · 1F Overseer` is rebadged, name unchanged.
  - A renamed old name found in `boss_hierarchy_chains` exits 1.
  - An entry naming `npc_id` 29001 exits 1.

- [ ] **Step 4: Run to confirm they fail.** `cd scripts && node --test tests/mob-body-plan-pass.test.mjs`. Expected: FAIL, script missing.

- [ ] **Step 5: Implement.** Work on a deep copy, in order: load picks; reject bad entries (R3, 29001, unknown row, duplicate `row`); apply each entry to its row and derive `race_badge`; replace `old → new`, and the same pair with the `[...] ` prefix stripped, in that floor's `rooms[].key_mobs` and `boss_tier_highlight`; update matching `world_boss_spawn_radar` entries; set or remove `body_plan`/`body_kin`; rebadge every row whose race changed or whose badge matches the filler regex; count tiers and eligible pools (R1/R2); scan all strings under `multi_floor_dungeons` and every radar `boss_name` for the filler regex (R6); check chains for renamed old names. Write only if every check passed, through a temp file and `os.replace`. Skip replacement when `old == new`, which gives R4.

- [ ] **Step 6: Run to confirm they pass.** Same command. Expected: all pass, exit 0.

- [ ] **Step 7: Commit.**
  ```bash
  git add content/studio/schemas/t-shaped-world-atlas.schema.json scripts/mob_body_plan_pass.py scripts/tests/mob-body-plan-pass.test.mjs
  git commit -m "feat: add mob body plan pass and schema fields"
  ```

### Task 2: Gate `G-MOB-SHAPE`

**Files:**
- Create: `scripts/lib/mob-shape.mjs`
- Test: `scripts/tests/mob-shape-gate.test.mjs`

**Interfaces:**
- Consumes: picks shape and filler regex from Task 1.
- Produces: `checkMobShape(atlas, picks) -> string[]`, one message per problem, naming the row key. `TIER_RANGES`, `tierCounts(atlas) -> {Monster, 'Mini-Boss', Raid, MVP}`.

- [ ] **Step 1: Write the failing tests.** Start from a minimal valid fixture built in the test file, then break it once per rule and assert the message names the row:
  1. tier out of range; 2. tagged row with `ogre_orc`, `robotic`; 3. `npc_id` 29001 tagged; 4. tagged rows differ from picks, in both directions; 5. tagged name containing worm, slime, vine, ooze; 6. filler name in a row name, in `key_mobs`, in `boss_tier_highlight` (the stale fixture from the spec's acceptance), in `race_badge` and in a radar `boss_name`; 7. two boss rows share a name; 8. off-Steppe `robotic` boss row not on `keep_robotic`; 9. `body_kin` not matching its `race_key` per the spec's table. Also: the valid fixture returns `[]`, and a Steppe `robotic` boss row is allowed.

- [ ] **Step 2: Run, expect FAIL.** `cd scripts && node --test tests/mob-shape-gate.test.mjs`

- [ ] **Step 3: Implement `scripts/lib/mob-shape.mjs`.** A pure function with no file reads; the test loads the JSON.

- [ ] **Step 4: Prove each rule can fail.** Delete each of the 9 rule blocks in turn and run the tests. Each deletion must fail exactly its own test; restore after each. Record the result in the commit body.

- [ ] **Step 5: Commit.**
  ```bash
  git add scripts/lib/mob-shape.mjs scripts/tests/mob-shape-gate.test.mjs
  git commit -m "feat: add G-MOB-SHAPE gate"
  ```

### Task 3: Draft the picks and apply them

**Files:**
- Create: `content/studio/mob_body_plan_picks.json`
- Modify: `content/studio/t_shaped_world_atlas.json`, `scripts/tests/mob-shape-gate.test.mjs`

**Interfaces:**
- Consumes: Task 1 CLI, Task 2 `checkMobShape`.
- Produces: 89 tagged rows that Task 4 reads as `sp.body_plan`.

- [ ] **Step 1: Dispatch the picks draft.** Agent `monster-and-mob-designer`, `model: sonnet`. Brief: the spec's Design section; the row list from Task 1 with zone, floor, level and god theme from `boss_hierarchy_chains`. Rules: one unique name per filler row from zone habitat and god theme; Steppe rows stay `robotic`, except the six catacomb MVPs in correction 9, which become `undead` untagged; 10/20/26/33 tagged rows; rows inside one dungeon vary in kin; no other game's boss names; camera-literal silhouette words in names, no analogy. Add the off-Steppe authored robots with `race_key` only. Rename the Baium row. `keep_robotic` holds only the `Discarded Kiln-Guardian` row key. Output is the JSON file only.

- [ ] **Step 2: Check before writing.** `python3 scripts/mob_body_plan_pass.py --check`. Expected: exit 0. If it fails, send the problem lines to a fresh designer agent, one round.

- [ ] **Step 3: Add the real-atlas test.**
  ```js
  test("committed atlas and picks pass G-MOB-SHAPE", () => {
    const atlas = JSON.parse(readFileSync(join(ROOT, "content/studio/t_shaped_world_atlas.json"), "utf8"));
    const picks = JSON.parse(readFileSync(join(ROOT, "content/studio/mob_body_plan_picks.json"), "utf8"));
    assert.deepEqual(checkMobShape(atlas, picks), []);
    assert.deepEqual(tierCounts(atlas), { Monster: 10, "Mini-Boss": 20, Raid: 26, MVP: 33 });
  });
  ```
  Run it. Expected: FAIL, atlas not applied.

- [ ] **Step 4: Apply and diff.** Run the script, then run it again and confirm `git diff --stat` does not change. With a small script, compare every spawn row against `git show HEAD:content/studio/t_shaped_world_atlas.json`: stats, level, drops, `spawn_count`, `respawn_sec`, `loc_coord` and `npc_id` are all equal, and row 29001 is unchanged.

- [ ] **Step 5: Validate.** `cd scripts && npm test`, then `python3 scripts/studio_world_governance.py`. Expected: exit 0. Check the governance CLI's real arguments in its `__main__` block before running.

- [ ] **Step 6: Commit, then phase gate.** Stage the two JSON files and the test by name. `git commit -m "feat: repair filler bosses and tag upright monsters"`. Review Tasks 1-3 as one wave: `code-reviewer` + `python-reviewer`, and `monster-and-mob-designer` reads 20 random entries for canon fit, then `/simplify`, then re-run `npm test`.

### Task 4: Toggle in the spawn matrix

**Files:**
- Modify: `scripts/atlas_world_web/frontend/02_state_and_composable_layers.js` (URL read ~262, URL write ~420, `setAtlasFilter` ~3450)
- Modify: `scripts/atlas_world_web/frontend/04_studio_overlay_bars_a.js` (`renderAtlasFilteredEntityMatrixHtml`, line ~163; header counts 299, 303; tier tabs 314; locate button 341)
- Modify: `scripts/atlas_world_web/frontend/01_shell_and_styles.html` (touch rule, stable status node)
- Create: `scripts/tests/e2e/atlas-upright-toggle.e2e.mjs`

**Interfaces:**
- Consumes: `sp.body_plan`, `sp.body_kin` from Task 3.
- Produces: `ATLAS_STATE_STORE.shape` (`'' | 'upright'`), `toggleAtlasShape()`, `clearAtlasShapeFilters()`, URL param `shape=upright`.

- [ ] **Step 0:** Invoke `impeccable` (shape), per global rule 16, before touching the UI.

- [ ] **Step 1: Write the failing real-click check.** Resolve Playwright with `createRequire(join(ROOT, 'client/react-client/package.json'))`, trying `@playwright/test` then `playwright`, after `npm ci` there. Serve this worktree with `python3 scripts/catalog_explorer_web.py --port <free port>`, never 8788. Drive with real mouse and keyboard only, never by calling app functions:
  - Read the atlas JSON in the same run and compute the tagged count.
  - Click the toggle. `aria-pressed="true"`; the URL has `shape=upright`; the status line equals the computed count and split; the DOM holds that many row cards; `Queen Ant Ash-Brood Sovereign` is absent; focus stays on the toggle.
  - Reload: still on, matrix open.
  - Pick a tier tab: rows narrow and the status line follows.
  - Filter to nothing with a search: "No upright monsters match these filters". Click "Clear filters": all filters reset, focus on the toggle.
  - The header count beside the matrix title equals the status line count.
  - Partial and Error: use `page.route` on the bundle request to strip `body_plan` from the data, then to drop `multi_floor_dungeons`, and assert each state's exact copy, including the disabled toggle.
  - Keyboard only: Tab to the toggle, Space, Tab to a row's locate button, Enter opens it, Back returns, toggle still on.

- [ ] **Step 2: Run, expect FAIL.** Toggle not found.

- [ ] **Step 3: State and URL.** In `02_state_and_composable_layers.js`:
  - Read: `const shape = params.get('shape');`, then `ATLAS_STATE_STORE.shape = shape === 'upright' ? 'upright' : '';`, and `ATLAS_ENTITY_MATRIX_OPEN = true` when on. That `let` is declared at line 3514, so assign it where reads already run after declaration.
  - Write, inside the `studio`/`world` block: `if (ATLAS_STATE_STORE.shape) params.set('shape', ATLAS_STATE_STORE.shape);`
  - Add beside `setAtlasFilter`:
  ```js
  function toggleAtlasShape() {
    ATLAS_STATE_STORE.shape = ATLAS_STATE_STORE.shape ? '' : 'upright';
    if (ATLAS_STATE_STORE.shape) ATLAS_ENTITY_MATRIX_OPEN = true;
    writeUrlState(false);
    render();
    const el = document.getElementById('atlasShapeToggle');
    if (el) el.focus();
  }

  function clearAtlasShapeFilters() {
    ATLAS_STATE_STORE.omniSearchQuery = '';
    ATLAS_OMNI_SEARCH_QUERY = '';
    resetAtlasFilters();
    const el = document.getElementById('atlasShapeToggle');
    if (el) el.focus();
  }
  ```

- [ ] **Step 4: Render.** In `renderAtlasFilteredEntityMatrixHtml`:
  - Add `bodyPlan: sp.body_plan, bodyKin: sp.body_kin` to the dungeon `rows.push`.
  - Compute `allTagged`, the tagged count over every dungeon row, independent of filters.
  - After `filteredRows`: `const shapeOn = ATLAS_STATE_STORE.shape === 'upright'; const visibleRows = shapeOn ? filteredRows.filter(r => r.bodyPlan === 'upright_monster') : filteredRows; const displayRows = shapeOn ? visibleRows : visibleRows.slice(0, 18);`
  - Toggle in the always-visible header: `<button id="atlasShapeToggle" type="button" class="joy-button joy-button--sm ${shapeOn ? 'joy-button--solid' : 'joy-button--outline'}" aria-pressed="${shapeOn}" ${allTagged ? '' : 'disabled'} onclick="toggleAtlasShape()">Upright monster (${allTagged})</button>`
  - Status line, inside the open matrix: `Showing ${visibleRows.length} of ${totalDungeonRows} dungeon rows · Normal ${n} · Mini-boss ${n} · Raid ${n} · MVP ${n}`, counted from `visibleRows`. After render, copy that text into a stable `<div id="atlasShapeLive" role="status" class="sr-only">` added to `01_shell_and_styles.html`; check `.sr-only` exists there and add it if not.
  - Lines 299 and 303 print `visibleRows.length`, not `filteredRows.length`.
  - Text badge `Upright · ${kin}` on tagged cards.
  - The four states from the spec's table: Empty with a `Clear filters` button, Partial when `allTagged === 0`, Error when `tatlas` has no `multi_floor_dungeons`. Exact copy is in the spec.
  - Touch: give the locate button (`04:341`), tier tabs (`04:314`) and Clear filters the class `atlas-shape-target`, then in `01_shell_and_styles.html`: `@media (pointer: coarse) { #atlasShapeToggle, .atlas-shape-target { min-height: 44px; } }`.

- [ ] **Step 5: Run the check, expect PASS.** Then `python3 -m pytest tests/test_atlas_world_web.py tests/test_studio_web_perspectives.py -q`.

- [ ] **Step 6: Screenshots.** `ui-visual-verify` with `shoot.mjs` at 390x844 and 1280x800, toggle on. Read the images, fix any lint finding, show the final shots.

- [ ] **Step 7: Commit, then phase gate.** Stage the four files by name. `git commit -m "feat: add upright monster toggle to the atlas spawn list"`. Review with `code-reviewer` + `typescript-reviewer`, `impeccable` critique, `/simplify`, then re-run Step 5.

### Task 5: Docs and final verification

**Files:**
- Modify: `README.md`, `.gitignore`

- [ ] **Step 1: README.** Add one bullet to the atlas section: the upright monster shape tag, the picks file, the script command and `G-MOB-SHAPE`.

- [ ] **Step 2: `.gitignore`, as its own commit.** Add `.claude/cargo-target-*/`. This is left over from the 1.18 cleanup repair; the release guard blocks it on the release branch and `.git/info/exclude` is only a local stopgap.
  ```bash
  git add .gitignore && git commit -m "chore: ignore per-session cargo target folders"
  ```

- [ ] **Step 3: End-to-end.** `cd scripts && node --test tests/mob-shape-gate.test.mjs`, then `./scripts/precheck.sh`, then the Task 4 check. Show the output.

- [ ] **Step 4: Live check.** Open the served page from this worktree and press the toggle with a real mouse. Quote the status line. It must read `Showing 89 of 262 dungeon rows · Normal 10 · Mini-boss 20 · Raid 26 · MVP 33`. This is not visible on `:8788` until another session's process serves the merged content; say so in the report.

- [ ] **Step 5: Commit README, then `psrw ship`.**

## Audit trail

- 2026-11-01 self-grill (independent Opus read of plan, spec, code, atlas). 1 CRITICAL, 4 HIGH, 5 MEDIUM, 2 LOW. All applied: corrections 5-12 above, plus Task 1, 2 and 4 edits. The CRITICAL (26 floors, prefix-stripped) and the radar HIGH (13 names) were re-measured by the orchestrator and hold.
