# asset-storybook Art-Direction Review Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `tools/asset-storybook` into an art-direction review surface that stays fast at 742 cards, organizes assets by a gate-enforced taxonomy, and records `reject`/`rebuild` verdicts the art pipeline can consume.

**Architecture:** A build-time bake produces one 256px webp thumbnail per asset plus an index; the page renders only thumbnails through a virtualized grid (<400 DOM nodes), promoting exactly one asset at a time to a live `<model-viewer>` in a detail overlay. Pure data logic moves to `js/data/` where `node --test` covers it; two new gate guards make mislabelled kinds and stale thumbnails impossible.

**Tech Stack:** Vanilla ES modules (no bundler, no framework — the page is served as static files by nginx), Node 22+ with `node:test`, `sharp` for 2D resizing, headless Blender 4.5 for 3D posters, `@google/model-viewer` 4.3.1 via unpkg CDN.

**Spec:** `docs/superpowers/specs/2026-08-08-asset-storybook-review-surface-design.md`

## Global Constraints

- **Prettier must pass.** Husky + lint-staged run `prettier --write` on commit. Run `npx prettier --write` on every file you touch before committing.
- **`resolveRender` and `primaryPath` in `tools/asset-storybook/js/renderers.mjs` must stay byte-identical** to their copy in `scripts/check_asset_manifest.mjs`, modulo a leading `export `. `scripts/tests/resolve_render_mirror.test.mjs` enforces this and must keep passing. If you move the block to a new file, update `STORYBOOK_FILE` in that test to the new path — never weaken `BLOCK_PATTERN`.
- **No new runtime dependency for the page.** The storybook loads as plain `<script type="module">` from nginx. `sharp` is a *build-time* dependency of `scripts/`, never imported by anything under `tools/asset-storybook/js/`.
- **Thumbnail size: 256 px on the long edge. Format: webp, quality 82 (sharp) / 85 (Blender).**
- **Thumbnail directory: `game-client/assets/.thumbs/`.** Filenames are `<sha256(sourceResPath).slice(0,16)>.webp`.
- **Verdict vocabulary is exactly `reject` and `rebuild`.** No other values. A verdict without a non-empty `note` is invalid.
- **Baseline numbers to beat** (Chrome, no scroll, 15 s settle): 643 `<model-viewer>`, 11,268 DOM nodes, 16.4 MB transferred, 11 of 23 sidebar dots stuck at `loading…`.
- **`npm ci --prefix scripts` then `npm test --prefix scripts` is already a CI step** — tests placed in `scripts/tests/*.test.mjs` run automatically. Tests under `tools/asset-storybook/tests/` need an explicit CI step (Task 10).

---

## Phasing note — deviation from spec §6

The spec's Phase 1 listed the health redefinition and the 16.4 MB fix. Both **depend on thumbnails existing**: without a thumbnail, a concept-art card can only load its 1.4 MB source or show nothing, and health can only be counted over thumbnails once thumbnails are what the page requests. Both therefore move to Phase 2. Phase 1 keeps what is genuinely independent, plus a partial byte reduction (Task 4) that is real and measurable on its own.

| Phase | Tasks | Deliverable |
| --- | --- | --- |
| 1 | 1–4 | Taxonomy registry + gate guard; viewport-driven image promotion |
| 2 | 5–9 | Thumbnail spine, index, staleness gate, health that settles |
| 3 | 10–13 | Pure data layer, virtual grid, detail overlay |
| 4 | 14–18 | Review layer |

**Every phase ends with the standing quality gate:** verify → independent adversarial review of that phase's diff → refactor → re-verify.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `content/asset-taxonomy.json` | Registry: manifest `kind` → section id, label, order. Single source of section naming. |
| `tools/asset-storybook/js/data/taxonomy.mjs` | Pure: load taxonomy, resolve a `kind` to a section, group entries. No DOM. |
| `tools/asset-storybook/js/data/manifests.mjs` | Pure: merge manifest sources into one entry list; join the thumb index. |
| `tools/asset-storybook/js/data/thumbs.mjs` | Pure: thumb-key hashing + index lookup. Mirrors the bake script's hash. |
| `tools/asset-storybook/js/view/VirtualGrid.mjs` | Windowed grid: renders only cards near the viewport, recycles elements. |
| `tools/asset-storybook/js/view/DetailOverlay.mjs` | The single live `<model-viewer>`; mounts on open, disposes on close. |
| `tools/asset-storybook/js/view/Card.mjs` | Builds one thumbnail card (all render-types — the thumbnail makes them uniform). |
| `tools/asset-storybook/js/review/store.mjs` | Verdict state: load committed queue, merge localStorage, export. |
| `tools/asset-storybook/js/review/ui.mjs` | Verdict controls, unsaved bar, compare tray. |
| `tools/asset-storybook/tests/*.test.mjs` | `node --test` over `js/data/` and `js/review/store.mjs`. |
| `scripts/bake_thumbnails.mjs` | Bake entry point; dispatches to sharp or Blender; writes the index. |
| `scripts/bake_poster.py` | Blender-side: import glb, adaptive azimuth, fixed rig, render webp. |
| `scripts/lib/thumbkey.mjs` | Shared hash used by the bake script **and** the gate. |
| `content/review-queue.json` | Committed verdicts. Source of truth. |

**Modified:**

| Path | Change |
| --- | --- |
| `scripts/check_asset_manifest.mjs` | Add guard (H) taxonomy coverage, guard (I) thumbnail freshness. |
| `scripts/package.json` | Add `sharp` dependency. |
| `tools/asset-storybook/js/sidebar.mjs` | Delete `RENDER_LABELS`; delegate to `data/taxonomy.mjs`. |
| `tools/asset-storybook/js/utils.mjs` | Delete the HEAD size-probe queue (Task 8). |
| `tools/asset-storybook/js/main.mjs` | Shrink to composition only. |
| `tools/asset-storybook/js/health.mjs` | Health over thumbnails. |
| `tools/asset-storybook/js/art-tabs.mjs` | Viewport-driven promotion instead of blanket eager. |
| `tools/asset-storybook/index.html` | Styles for overlay, tray, verdict controls. |
| `.github/workflows/ci.yml` | Add storybook `node --test` step. |
| `scripts/precheck.sh` | Add storybook `node --test` to Gate 1. |
| `.gitignore` | Ensure `.thumbs/` is **tracked** (explicit negation if a broad ignore catches it). |

---

# Phase 1 — Taxonomy and byte reduction

## Task 1: Taxonomy registry + pure resolver

**Files:**
- Create: `content/asset-taxonomy.json`
- Create: `tools/asset-storybook/js/data/taxonomy.mjs`
- Create: `tools/asset-storybook/tests/taxonomy.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `loadTaxonomy(json) -> { sections: Map<sectionId, {id,label,order}>, kindToSection: Map<kind, sectionId> }`
  - `sectionForEntry(entry, taxonomy) -> string` (section id, or `"__untaxonomized"`)
  - `labelForSection(sectionId, taxonomy) -> string`
  - `groupEntries(entries, taxonomy) -> Map<sectionId, Array<[key, entry]>>` preserving `order`

- [ ] **Step 1: Write the failing test**

Create `tools/asset-storybook/tests/taxonomy.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadTaxonomy,
  sectionForEntry,
  labelForSection,
  groupEntries,
} from "../js/data/taxonomy.mjs";

const FIXTURE = {
  version: 1,
  sections: [
    { id: "character", label: "Characters", order: 10, kinds: ["character"] },
    { id: "dungeon", label: "Dungeon Kit", order: 60, kinds: ["dungeon"] },
  ],
};

test("resolves a kind to its section", () => {
  const t = loadTaxonomy(FIXTURE);
  assert.equal(sectionForEntry({ kind: "dungeon" }, t), "dungeon");
});

test("labels come from the registry, never from string munging", () => {
  const t = loadTaxonomy(FIXTURE);
  assert.equal(labelForSection("dungeon", t), "Dungeon Kit");
});

test("an unregistered kind lands in __untaxonomized, not a munged label", () => {
  const t = loadTaxonomy(FIXTURE);
  assert.equal(sectionForEntry({ kind: "sasquatch" }, t), "__untaxonomized");
  assert.equal(labelForSection("__untaxonomized", t), "Untaxonomized");
});

test("groupEntries returns sections in registry order", () => {
  const t = loadTaxonomy(FIXTURE);
  const grouped = groupEntries(
    [
      ["d1", { kind: "dungeon" }],
      ["c1", { kind: "character" }],
    ],
    t,
  );
  assert.deepEqual([...grouped.keys()], ["character", "dungeon"]);
  assert.equal(grouped.get("dungeon").length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/asset-storybook/tests/taxonomy.test.mjs`
Expected: FAIL — `Cannot find module '../js/data/taxonomy.mjs'`

- [ ] **Step 3: Write `content/asset-taxonomy.json`**

Kinds present today, verified from the manifests: `character`, `vfx`, `creature`, `environment`, `weapon`, `loot`, `dungeon`, `prop`.

```json
{
  "version": 1,
  "sections": [
    { "id": "character", "label": "Characters", "order": 10, "kinds": ["character"] },
    { "id": "creature", "label": "Creatures", "order": 20, "kinds": ["creature"] },
    { "id": "vfx", "label": "VFX", "order": 30, "kinds": ["vfx"] },
    { "id": "weapon", "label": "Weapons", "order": 40, "kinds": ["weapon"] },
    { "id": "loot", "label": "Loot & Items", "order": 50, "kinds": ["loot"] },
    { "id": "dungeon", "label": "Dungeon Kit", "order": 60, "kinds": ["dungeon"] },
    { "id": "environment", "label": "Environment", "order": 70, "kinds": ["environment"] },
    { "id": "prop", "label": "Props & UI", "order": 80, "kinds": ["prop"] }
  ]
}
```

- [ ] **Step 4: Write minimal implementation**

Create `tools/asset-storybook/js/data/taxonomy.mjs`:

```js
// Section naming comes from content/asset-taxonomy.json — never from
// string munging. A kind with no registry entry lands in __untaxonomized,
// which guard (H) in scripts/check_asset_manifest.mjs fails the build on.
// That is why "Model3d:dungeons (283)" cannot happen again.

export const UNTAXONOMIZED = "__untaxonomized";

export function loadTaxonomy(json) {
  const sections = new Map();
  const kindToSection = new Map();
  const ordered = [...(json.sections || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  for (const s of ordered) {
    sections.set(s.id, { id: s.id, label: s.label || s.id, order: s.order ?? 0 });
    for (const kind of s.kinds || []) kindToSection.set(kind, s.id);
  }
  return { sections, kindToSection };
}

export function sectionForEntry(entry, taxonomy) {
  const kind = entry && entry.kind;
  if (!kind) return UNTAXONOMIZED;
  return taxonomy.kindToSection.get(kind) || UNTAXONOMIZED;
}

export function labelForSection(sectionId, taxonomy) {
  if (sectionId === UNTAXONOMIZED) return "Untaxonomized";
  const s = taxonomy.sections.get(sectionId);
  return s ? s.label : sectionId;
}

export function groupEntries(entries, taxonomy) {
  const grouped = new Map();
  for (const id of taxonomy.sections.keys()) grouped.set(id, []);
  for (const [key, entry] of entries) {
    const sid = sectionForEntry(entry, taxonomy);
    if (!grouped.has(sid)) grouped.set(sid, []);
    grouped.get(sid).push([key, entry]);
  }
  for (const [sid, list] of [...grouped]) if (list.length === 0) grouped.delete(sid);
  return grouped;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tools/asset-storybook/tests/taxonomy.test.mjs`
Expected: PASS — 4 tests

- [ ] **Step 6: Commit**

```bash
npx prettier --write content/asset-taxonomy.json tools/asset-storybook/js/data/taxonomy.mjs tools/asset-storybook/tests/taxonomy.test.mjs
git add content/asset-taxonomy.json tools/asset-storybook/js/data/taxonomy.mjs tools/asset-storybook/tests/taxonomy.test.mjs
git commit -m "feat(storybook): asset taxonomy registry + pure resolver"
```

---

## Task 2: Rewire the sidebar to the registry, delete `RENDER_LABELS`

**Files:**
- Modify: `tools/asset-storybook/js/sidebar.mjs` (delete `RENDER_LABELS` at lines 24–38, `groupKeyFor` at 156–161, `groupByRender` at 163–171)
- Modify: `tools/asset-storybook/js/main.mjs` (fetch the taxonomy; call `groupEntries`)
- Modify: `tools/asset-storybook/js/state.mjs` (add `TAXONOMY_URL`)

**Interfaces:**
- Consumes: `loadTaxonomy`, `groupEntries`, `labelForSection` from Task 1.
- Produces: `classLabel(cls, taxonomy)` — same call site contract as today, one extra argument.

- [ ] **Step 1: Add the URL constant**

In `tools/asset-storybook/js/state.mjs`, after `RENDER_SPEC_URL`:

```js
export const TAXONOMY_URL = "../../content/asset-taxonomy.json";
```

- [ ] **Step 2: Replace `RENDER_LABELS` usage in `classLabel`**

In `tools/asset-storybook/js/sidebar.mjs`, delete the entire `RENDER_LABELS` object and replace the final two lines of `classLabel` with a registry lookup:

```js
import { labelForSection } from "./data/taxonomy.mjs";

export function classLabel(cls, taxonomy) {
  if (cls === "all") return "All";
  if (cls === SFX_CLASS) return "SFX";
  if (cls === MUSIC_CLASS) return "Music";
  if (cls === ART_CLASS) return "Concept Art";
  if (cls === COVERAGE_CLASS) return "Coverage";
  if (cls === COMBAT_CLASS) return "Combat";
  if (cls.startsWith(ART_CLASS + ":")) {
    const gid = cls.slice(ART_CLASS.length + 1);
    return ART_GROUP_LABELS.get(gid) || gid + " (unregistered)";
  }
  return labelForSection(cls, taxonomy);
}
```

- [ ] **Step 3: Delete `groupKeyFor` and `groupByRender`**

Remove both functions from `sidebar.mjs`. In `main.mjs`, replace `const groups = groupByRender(entries, renderSpec);` with:

```js
const taxonomy = loadTaxonomy(await fetchJson(TAXONOMY_URL, "asset-taxonomy"));
const groups = groupEntries(entries, taxonomy);
```

Then update every `classLabel(x)` call site in `main.mjs` and `sidebar.mjs` to `classLabel(x, taxonomy)`. `buildSidebarItem(cls, total)` gains a third parameter `taxonomy` and passes it through.

- [ ] **Step 4: Verify in the browser**

```bash
python3 -m http.server 8765 &
```

Open `http://localhost:8765/tools/asset-storybook/index.html`, then in the console:

```js
[...document.querySelectorAll('section.kind-section h2')].map(h => h.textContent)
```

Expected: **no entry matching `/^Model3d:/`**. `Dungeon Kit (283)` present. Kill the server when done.

- [ ] **Step 5: Commit**

```bash
npx prettier --write tools/asset-storybook/js/sidebar.mjs tools/asset-storybook/js/main.mjs tools/asset-storybook/js/state.mjs
git add tools/asset-storybook/js
git commit -m "refactor(storybook): section labels from taxonomy registry"
```

---

## Task 3: Gate guard (H) — every kind must be taxonomized

**Files:**
- Modify: `scripts/check_asset_manifest.mjs`
- Create: `scripts/tests/taxonomy_coverage.test.mjs`

**Interfaces:**
- Consumes: `content/asset-taxonomy.json`.
- Produces: `assertTaxonomyCoverage(sourcesEntries, taxonomyJson, failures) -> void` (pushes strings onto `failures`), exported for the test.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/taxonomy_coverage.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTaxonomyCoverage } from "../check_asset_manifest.mjs";

const TAX = { version: 1, sections: [{ id: "character", label: "Characters", order: 10, kinds: ["character"] }] };

test("a kind with no taxonomy section fails the gate", () => {
  const failures = [];
  assertTaxonomyCoverage(
    [{ label: "manifest.json", entries: { "mob:x": { kind: "sasquatch" } } }],
    TAX,
    failures,
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /sasquatch/);
  assert.match(failures[0], /asset-taxonomy\.json/);
});

test("a fully taxonomized manifest passes clean", () => {
  const failures = [];
  assertTaxonomyCoverage(
    [{ label: "manifest.json", entries: { player: { kind: "character" } } }],
    TAX,
    failures,
  );
  assert.deepEqual(failures, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/taxonomy_coverage.test.mjs`
Expected: FAIL — `assertTaxonomyCoverage` is not exported

- [ ] **Step 3: Implement the guard**

In `scripts/check_asset_manifest.mjs`, next to `assertDisjoint` (line ~550), add:

```js
// (H) taxonomy coverage — every manifest `kind` must have a section in
// content/asset-taxonomy.json. Before this guard, an unregistered kind fell
// through the storybook's label lookup and rendered as e.g.
// "Model3d:dungeons (283)" — a silent lookup miss, not an error.
export function assertTaxonomyCoverage(sourcesEntries, taxonomyJson, failures) {
  const known = new Set();
  for (const s of taxonomyJson.sections || []) for (const k of s.kinds || []) known.add(k);
  const seen = new Map(); // kind → first id that used it
  for (const { entries } of sourcesEntries) {
    for (const [id, entry] of Object.entries(entries)) {
      const kind = entry && entry.kind;
      if (!kind || known.has(kind)) continue;
      if (!seen.has(kind)) seen.set(kind, id);
    }
  }
  for (const [kind, id] of seen) {
    failures.push(
      `kind "${kind}" (first used by entry "${id}") has no section in content/asset-taxonomy.json — ` +
        `add it to a section's "kinds" array so the storybook can label it`,
    );
  }
}
```

Wire it into the main run, beside the existing `assertDisjoint` call:

```js
const taxonomyJson = readJson(join(repoRoot, "content/asset-taxonomy.json"));
assertTaxonomyCoverage(sourcesEntries, taxonomyJson, failures);
```

> `readJson` already exists in this file. Confirm its exact name with `grep -n "function readJson" scripts/check_asset_manifest.mjs` before use — a falsy-return `readJson` has bitten this repo before (F-013).

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test scripts/tests/taxonomy_coverage.test.mjs
node scripts/check_asset_manifest.mjs
```
Expected: 2 tests PASS; the gate exits 0 against the real manifests.

- [ ] **Step 5: Prove the guard actually fails**

Temporarily change one entry's `kind` in `game-client/assets/catalog-manifest.json` to `"sasquatch"`, run `node scripts/check_asset_manifest.mjs`, confirm a **non-zero exit** naming `sasquatch`, then revert with `git checkout game-client/assets/catalog-manifest.json`.

- [ ] **Step 6: Commit**

```bash
npx prettier --write scripts/check_asset_manifest.mjs scripts/tests/taxonomy_coverage.test.mjs
git add scripts/check_asset_manifest.mjs scripts/tests/taxonomy_coverage.test.mjs
git commit -m "feat(gate): guard H — every manifest kind must be taxonomized"
```

---

## Task 4: Viewport-driven image promotion (partial byte reduction)

**Files:**
- Modify: `tools/asset-storybook/js/art-tabs.mjs` (`eagerLoadCard` at lines 79–82; `applyArtTabFilter` at 89–120)
- Modify: `tools/asset-storybook/js/sidebar.mjs` (the `eagerLoadCard` loop at lines 88–91)

**Interfaces:**
- Consumes: nothing new.
- Produces: `observeCardForPromotion(card) -> void` replaces `eagerLoadCard(card)` at every call site.

**Why:** `eagerLoadCard` flips *every* card in a newly-visible section from `loading="lazy"` to `"eager"`, so opening the default Cast tab downloads all 9 of its 1.1–1.5 MB PNGs. Promoting only cards that actually intersect the viewport keeps the same "an opened group settles" behaviour while loading ~3 instead of 9.

- [ ] **Step 1: Replace `eagerLoadCard` with an observer**

In `tools/asset-storybook/js/art-tabs.mjs`, replace the `eagerLoadCard` function with:

```js
// A card inside a display:none section has no layout box, so its
// loading="lazy" <img> never fetches. The old fix promoted EVERY card in a
// revealed section to loading="eager" — which downloaded all 9 Cast PNGs
// (~12 MB) the moment the page opened on its default tab. Observing instead
// promotes only cards that actually reach the viewport: same settle
// behaviour for what you look at, without paying for what you don't.
const promoter = new IntersectionObserver(
  (entries, obs) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const img = e.target.querySelector("img");
      if (img && img.loading === "lazy") img.loading = "eager";
      obs.unobserve(e.target);
    }
  },
  { rootMargin: "300px" },
);

export function observeCardForPromotion(card) {
  promoter.observe(card);
}
```

- [ ] **Step 2: Update both call sites**

In `art-tabs.mjs` `applyArtTabFilter`, change `if (showCard) eagerLoadCard(card);` to `if (showCard) observeCardForPromotion(card);`.

In `sidebar.mjs`, change the import and the loop body:

```js
import { applyArtTabFilter, observeCardForPromotion } from "./art-tabs.mjs";
// ...
sec.querySelectorAll(".card").forEach((card) => {
  card.style.display = "";
  observeCardForPromotion(card);
});
```

- [ ] **Step 3: Measure the reduction**

```bash
python3 -m http.server 8765 &
```

Load the page, wait 15 s, then in the console:

```js
+(performance.getEntriesByType('resource').reduce((a,r)=>a+(r.transferSize||0),0)/1048576).toFixed(1)
```

Expected: **materially below 16.4** (target ≈ 6–8 MB; the remaining bulk is VFX spritesheets, which Task 8 removes). Record the actual number in the commit message. Kill the server.

- [ ] **Step 4: Commit**

```bash
npx prettier --write tools/asset-storybook/js/art-tabs.mjs tools/asset-storybook/js/sidebar.mjs
git add tools/asset-storybook/js
git commit -m "perf(storybook): promote art images on viewport entry, not on tab reveal"
```

- [ ] **Step 5: Phase 1 quality gate**

Run `/superpowers:requesting-code-review` (or dispatch the `code-reviewer` agent) against the Phase 1 diff: `git diff main...HEAD`. Act on every finding before starting Task 5. Re-run `node --test scripts/tests/*.test.mjs tools/asset-storybook/tests/*.test.mjs` and `node scripts/check_asset_manifest.mjs` afterward.

---

# Phase 2 — The thumbnail spine

## Task 5: Shared thumb-key + sharp backend + index writer

**Files:**
- Create: `scripts/lib/thumbkey.mjs`
- Create: `scripts/bake_thumbnails.mjs`
- Create: `scripts/tests/thumbkey.test.mjs`
- Modify: `scripts/package.json` (add `sharp`)

**Interfaces:**
- Consumes: `resolveRender` semantics (read `render-spec.json`, same rules as the gate).
- Produces:
  - `thumbKey(resPath) -> string` — 16-hex-char id, used by the bake script, the gate, and the page.
  - `thumbFilename(resPath) -> string` — `<thumbKey>.webp`
  - `scripts/bake_thumbnails.mjs` CLI: `--only <glob>`, `--force`, `--dry-run`
  - `game-client/assets/.thumbs/index.json` shape:
    ```json
    { "version": 1, "entries": { "res://assets/x.glb": { "thumb": "ab12cd34ef567890.webp", "bytes": 123456, "w": 256, "h": 256 } } }
    ```

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/thumbkey.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { thumbKey, thumbFilename } from "../lib/thumbkey.mjs";

test("thumbKey is stable and 16 hex chars", () => {
  const k = thumbKey("res://assets/characters/player_knight.glb");
  assert.match(k, /^[0-9a-f]{16}$/);
  assert.equal(k, thumbKey("res://assets/characters/player_knight.glb"));
});

test("different paths get different keys", () => {
  assert.notEqual(thumbKey("res://a.glb"), thumbKey("res://b.glb"));
});

test("thumbFilename appends .webp", () => {
  assert.equal(thumbFilename("res://a.glb"), thumbKey("res://a.glb") + ".webp");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/thumbkey.test.mjs`
Expected: FAIL — cannot find `../lib/thumbkey.mjs`

- [ ] **Step 3: Implement the shared key**

Create `scripts/lib/thumbkey.mjs`:

```js
import { createHash } from "node:crypto";

// Content-addressed by SOURCE PATH, not source bytes: the gate compares
// mtimes to detect staleness, so the filename must stay stable when the
// asset changes. A flat hashed directory also means the .thumbs tree has no
// layout that can drift from game-client/assets/.
export function thumbKey(resPath) {
  return createHash("sha256").update(resPath).digest("hex").slice(0, 16);
}

export function thumbFilename(resPath) {
  return thumbKey(resPath) + ".webp";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/thumbkey.test.mjs`
Expected: PASS — 3 tests

- [ ] **Step 5: Add sharp**

```bash
npm install --prefix scripts sharp
node --input-type=module -e "import sharp from 'sharp'; console.log('ok')"
```
Expected: `ok`. Confirm `scripts/package.json` gained `"sharp"` and `scripts/package-lock.json` updated.

- [ ] **Step 6: Implement the bake entry point (2D path only)**

Create `scripts/bake_thumbnails.mjs`. It must:

1. Read `manifest.json`, `catalog-manifest.json`, `art-manifest.json`, `render-spec.json`.
2. For each entry, resolve its source path (`entry.scene ?? entry.stream`, or `ART_ROOT + entry.file` for art) and its render-type.
3. Skip if the thumb exists and is newer than the source, unless `--force`.
4. Route `model3d` to the Blender queue (Task 6 — for now, log and skip), everything else to sharp:

```js
await sharp(absSrc)
  .resize(256, 256, { fit: "inside", withoutEnlargement: false })
  .webp({ quality: 82 })
  .toFile(absOut);
```

5. Accumulate `{ thumb, bytes, w, h }` per source path and write `.thumbs/index.json` sorted by key (deterministic output — an unsorted object churns the diff on every run).
6. Print a summary line: `baked N, skipped M, failed K`.
7. **Exit non-zero if any bake failed** — a silent partial bake is the failure mode this whole spine exists to prevent.

- [ ] **Step 7: Run the 2D bake and verify**

```bash
node scripts/bake_thumbnails.mjs
ls game-client/assets/.thumbs | wc -l
node -e "const i=require('./game-client/assets/.thumbs/index.json'); console.log(Object.keys(i.entries).length + ' indexed')"
```
Expected: ≥97 webp files (9 manifest 2D + 88 art), index populated, exit 0.

- [ ] **Step 8: Commit**

```bash
npx prettier --write scripts/lib/thumbkey.mjs scripts/bake_thumbnails.mjs scripts/tests/thumbkey.test.mjs
git add scripts/lib/thumbkey.mjs scripts/bake_thumbnails.mjs scripts/tests/thumbkey.test.mjs scripts/package.json scripts/package-lock.json game-client/assets/.thumbs
git commit -m "feat(bake): thumbnail key + sharp 2D backend + index writer"
```

---

## Task 6: Blender poster backend

**Files:**
- Create: `scripts/bake_poster.py`
- Modify: `scripts/bake_thumbnails.mjs` (wire the Blender queue)

**Interfaces:**
- Consumes: `thumbFilename` from Task 5.
- Produces: `scripts/bake_poster.py` reads a JSON job file `[[absSrcGlb, absOutWebp], ...]` and prints one `BAKE_OK:<basename>:<seconds>` or `BAKE_FAIL:<src>:<reason>` line per job.

**Verified spike parameters** (2026-08-08, Blender 4.5, 21 assets, 0 failures): 0.94 s/model batched, 6.9 KB average output.

- [ ] **Step 1: Write `scripts/bake_poster.py`**

```python
import bpy, sys, math, mathutils, os, json, time

argv = sys.argv[sys.argv.index("--") + 1:]
jobs = json.load(open(argv[0]))

for src, out in jobs:
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.import_scene.gltf(filepath=src)
    except Exception as e:
        print("BAKE_FAIL:%s:%s" % (src, e)); continue
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not objs:
        print("BAKE_FAIL:%s:no-mesh" % src); continue

    pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
    mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = (mn + mx) / 2
    dx, dy, dz = (mx - mn).x, (mx - mn).y, (mx - mn).z
    size = max(dx, dy, dz) or 1.0

    # Adaptive azimuth: an elongated object is turned so its long horizontal
    # axis runs DIAGONALLY across the square frame instead of spanning one
    # edge as a sliver. Elevation and the light rig never change, so material
    # response stays comparable across every card.
    base_az = 0.72
    if max(dx, dy) > 3.0 * min(dx, dy) if min(dx, dy) > 0 else False:
        base_az = 1.0 if dx >= dy else 0.35

    cam_data = bpy.data.cameras.new("C"); cam = bpy.data.objects.new("C", cam_data)
    bpy.context.scene.collection.objects.link(cam); bpy.context.scene.camera = cam
    d = size * 2.0
    cam.location = ctr + mathutils.Vector((d * base_az, -d * base_az, d * 0.45))
    cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()

    key = bpy.data.lights.new("K", 'SUN'); ko = bpy.data.objects.new("K", key)
    bpy.context.scene.collection.objects.link(ko)
    ko.rotation_euler = (math.radians(55), 0, math.radians(35)); key.energy = 3.5
    fill = bpy.data.lights.new("F", 'SUN'); fo = bpy.data.objects.new("F", fill)
    bpy.context.scene.collection.objects.link(fo)
    fo.rotation_euler = (math.radians(65), 0, math.radians(-120)); fill.energy = 1.2

    s = bpy.context.scene
    s.render.engine = 'BLENDER_EEVEE_NEXT'
    s.render.resolution_x = s.render.resolution_y = 256
    s.render.film_transparent = True
    s.render.image_settings.file_format = 'WEBP'
    s.render.image_settings.quality = 85
    s.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("BAKE_OK:%s:%.2fs" % (os.path.basename(out), time.time() - t0))
```

- [ ] **Step 2: Wire the Blender queue into `bake_thumbnails.mjs`**

Collect all stale `model3d` jobs into one array, write it to a temp JSON, and spawn **one** Blender process (batching is what makes it 0.94 s/model instead of 4.2 s):

```js
const BLENDER = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
// ...
const proc = spawnSync(BLENDER, ["-b", "--factory-startup", "--python", POSTER_PY, "--", jobFile], { encoding: "utf8" });
```

Parse `BAKE_OK:` / `BAKE_FAIL:` lines from stdout. **Blender does not exit non-zero on a Python exception** (documented in `tools/asset-forge/bake.sh`) — so count `BAKE_FAIL` lines and treat any as a hard failure. If `$BLENDER` is not executable, print a clear message and skip the 3D queue **without** failing (2D-only bakes must still work on a machine without Blender), but do **not** write index entries for un-baked models.

- [ ] **Step 3: Alpha auto-crop pass**

After Blender writes each poster, re-process it with sharp to trim the transparent margin and re-pad to square:

```js
await sharp(absOut).trim().resize(240, 240, { fit: "inside" })
  .extend({ /* centre-pad to 256x256, background transparent */ })
  .webp({ quality: 85 }).toFile(absOutFinal);
```

- [ ] **Step 4: Run the full bake**

```bash
time node scripts/bake_thumbnails.mjs
ls game-client/assets/.thumbs/*.webp | wc -l
du -sh game-client/assets/.thumbs
```
Expected: **741 webp**, ≈**4.5 MB**, ≈**10 minutes**, exit 0, zero `BAKE_FAIL`.

- [ ] **Step 5: Eyeball a contact sheet**

```bash
montage $(ls game-client/assets/.thumbs/*.webp | head -36) -background '#171b26' -tile 6x -geometry 190x190+8+8 /tmp/sheet.jpg
open /tmp/sheet.jpg
```
Confirm elongated assets (spears, swords, fences) fill their tiles rather than reading as slivers. If they do not, adjust `base_az` and re-run — this is the acceptance criterion the framing rule exists for.

- [ ] **Step 6: Commit**

```bash
git add scripts/bake_poster.py scripts/bake_thumbnails.mjs game-client/assets/.thumbs
git commit -m "feat(bake): Blender poster backend with adaptive azimuth + alpha crop"
```

---

## Task 7: Gate guard (I) — thumbnails never lie

**Files:**
- Modify: `scripts/check_asset_manifest.mjs`
- Create: `scripts/tests/thumb_freshness.test.mjs`

**Interfaces:**
- Consumes: `thumbFilename` from Task 5.
- Produces: `assertThumbFreshness(sourcesEntries, gameClient, failures) -> void`, exported for the test.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/thumb_freshness.test.mjs` using a `node:fs` temp dir: write a fake source file, write a thumb with an **older** mtime via `utimesSync`, assert one failure matching `/STALE/`; then touch the thumb newer and assert zero failures; then delete the thumb and assert one failure matching `/missing thumbnail/`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/thumb_freshness.test.mjs`
Expected: FAIL — `assertThumbFreshness` is not exported

- [ ] **Step 3: Implement the guard**

Mirror guard (F)'s existing shape in `check_asset_manifest.mjs`, but applied to **every** entry rather than only `bakedPreview` types:

```js
// (I) thumbnail freshness — the storybook renders every card from a baked
// thumbnail, so a thumbnail older than its source is a card that lies about
// what the asset looks like. Same mtime rule as guard (F), now universal.
// Pure filesystem comparison: CI needs no Blender, only re-baking does.
export function assertThumbFreshness(sourcesEntries, gameClient, failures) {
  for (const { entries } of sourcesEntries) {
    for (const [id, entry] of Object.entries(entries)) {
      const resPath = entry.scene ?? entry.stream;
      if (!resPath) continue;
      const srcP = resolveResPath(resPath, gameClient);
      const thumbP = join(gameClient, "assets/.thumbs", thumbFilename(resPath));
      if (!existsSync(thumbP)) {
        failures.push(`entry "${id}": missing thumbnail ${thumbFilename(resPath)} — run node scripts/bake_thumbnails.mjs`);
        continue;
      }
      if (existsSync(srcP) && statSync(srcP).mtimeMs > statSync(thumbP).mtimeMs) {
        failures.push(`entry "${id}": thumbnail is STALE — ${resPath} is newer than its thumbnail; re-bake`);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test scripts/tests/thumb_freshness.test.mjs
node scripts/check_asset_manifest.mjs
```
Expected: 3 tests PASS; gate exits 0.

- [ ] **Step 5: Prove the guard fails**

```bash
touch game-client/assets/characters/player_knight.glb
node scripts/check_asset_manifest.mjs; echo "exit=$?"
```
Expected: **non-zero**, message naming `STALE`. Then `node scripts/bake_thumbnails.mjs` and confirm the gate goes green again.

- [ ] **Step 6: Commit**

```bash
npx prettier --write scripts/check_asset_manifest.mjs scripts/tests/thumb_freshness.test.mjs
git add scripts/check_asset_manifest.mjs scripts/tests/thumb_freshness.test.mjs game-client/assets/.thumbs
git commit -m "feat(gate): guard I — thumbnails must exist and never outlive their source"
```

---

## Task 8: Cards render thumbnails; delete the HEAD-probe subsystem

**Files:**
- Create: `tools/asset-storybook/js/data/thumbs.mjs`
- Create: `tools/asset-storybook/tests/thumbs.test.mjs`
- Modify: `tools/asset-storybook/js/utils.mjs` (**delete** lines 11–54: `SIZE_PROBE_CONCURRENCY`, `activeProbes`, `probeQueue`, `pumpProbeQueue`, `attachFileSize`; keep `fmtBytes`, `resolveSceneSrc`, `filenameOf`)
- Modify: `tools/asset-storybook/js/renderers.mjs` (`buildCardShell` uses the index, not a probe)

**Interfaces:**
- Consumes: `.thumbs/index.json`.
- Produces:
  - `loadThumbIndex(json) -> Map<resPath, {thumb, bytes, w, h}>`
  - `thumbUrlFor(resPath, index) -> string | null`
  - `sizeTextFor(resPath, index) -> string` (e.g. `" · 241 KB"`, `""` if unknown)

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadThumbIndex, thumbUrlFor, sizeTextFor } from "../js/data/thumbs.mjs";

const IDX = { version: 1, entries: { "res://assets/a.glb": { thumb: "ab12.webp", bytes: 246784, w: 256, h: 256 } } };

test("resolves a thumbnail url", () => {
  assert.match(thumbUrlFor("res://assets/a.glb", loadThumbIndex(IDX)), /\.thumbs\/ab12\.webp$/);
});

test("formats size from the index, no network", () => {
  assert.equal(sizeTextFor("res://assets/a.glb", loadThumbIndex(IDX)), " · 241.0 KB");
});

test("an unindexed path yields null url and empty size", () => {
  const i = loadThumbIndex(IDX);
  assert.equal(thumbUrlFor("res://nope.glb", i), null);
  assert.equal(sizeTextFor("res://nope.glb", i), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/asset-storybook/tests/thumbs.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `js/data/thumbs.mjs`, then delete the probe queue**

Implement the three functions above (reuse the existing `fmtBytes` logic verbatim so the displayed format does not change). Then delete `attachFileSize` and its queue from `utils.mjs`, and in `renderers.mjs` `buildCardShell` replace:

```js
attachFileSize(sizeEl, primaryPath(entry));
```

with:

```js
sizeEl.textContent = sizeTextFor(primaryPath(entry), thumbIndex);
```

`buildCardShell` gains a `thumbIndex` parameter, threaded from `renderEntry`.

- [ ] **Step 4: Point every card's viewport at its thumbnail**

In `renderEntry`, when a thumbnail exists, build a plain `<img class="thumb">` viewport for **all** render-types instead of dispatching to `RENDERERS`. Keep the `RENDERERS` map — Task 12's overlay reuses those builders for the live view. A card with **no** thumbnail keeps the `buildUnknown` LOUD-red treatment.

- [ ] **Step 5: Verify**

```bash
python3 -m http.server 8765 &
```

Console after load:

```js
({ mv: document.querySelectorAll('model-viewer').length,
   heads: performance.getEntriesByType('resource').filter(r=>r.initiatorType==='fetch').length,
   mb: +(performance.getEntriesByType('resource').reduce((a,r)=>a+(r.transferSize||0),0)/1048576).toFixed(1) })
```
Expected: `mv: 0`, transferred **< 2 MB**, no long-tail probe traffic. Kill the server.

- [ ] **Step 6: Commit**

```bash
npx prettier --write tools/asset-storybook/js
git add tools/asset-storybook
git commit -m "perf(storybook): render cards from baked thumbnails; delete HEAD size-probe queue"
```

---

## Task 9: Health over thumbnails

**Files:**
- Modify: `tools/asset-storybook/js/health.mjs`
- Modify: `tools/asset-storybook/js/main.mjs` (`initHealth` call sites)

**Interfaces:**
- Consumes: thumbnail `load`/`error` events from Task 8's cards.
- Produces: unchanged public API — `initHealth(kind, total)`, `bumpHealth(kind, delta)`, `renderSidebarBadge(kind)`.

**Why:** `total` currently counts cards while only lazily-loaded models ever report, so 11 of 23 dots never settle. Thumbnails are what the page now requests, and every card has exactly one — so `total` and the number of reporters finally agree.

- [ ] **Step 1: Bump health from the thumbnail img, not the model**

In the Task 8 card builder, attach:

```js
img.addEventListener("load", () => bumpHealth(sectionId, { ok: 1 }));
img.addEventListener("error", () => bumpHealth(sectionId, { err: 1 }));
```

Remove the `bumpHealth` calls from `buildModel3d`, `buildImage`, `buildSpritesheet`, `buildNinePatch`, `buildTheme`, `buildTileset` — those builders now run only inside the overlay, where health is not counted.

- [ ] **Step 2: Verify every dot settles**

Load the page, wait 15 s, then:

```js
[...document.querySelectorAll('.sidebar-item')].filter(b => b.querySelector('.health-dot').title === 'loading…').map(b => b.dataset.class)
```
Expected: **`[]`** (baseline: 11 of 23 stuck).

> Virtualization is not in yet, so all cards exist and all thumbnails load. Task 11 must re-check this: a virtualized grid must count health over the **full entry list**, not over mounted cards — bump from the index-driven preload, not from DOM presence.

- [ ] **Step 3: Commit**

```bash
npx prettier --write tools/asset-storybook/js
git add tools/asset-storybook/js
git commit -m "fix(storybook): health counts thumbnails, so every class can settle"
```

- [ ] **Step 4: Phase 2 quality gate**

Independent adversarial review of the Phase 2 diff; act on findings; re-run `node --test scripts/tests/*.test.mjs tools/asset-storybook/tests/*.test.mjs` and `node scripts/check_asset_manifest.mjs`.

---

# Phase 3 — Architecture

## Task 10: Extract the pure data layer + wire CI

**Files:**
- Create: `tools/asset-storybook/js/data/manifests.mjs`
- Create: `tools/asset-storybook/tests/manifests.test.mjs`
- Modify: `.github/workflows/ci.yml`, `scripts/precheck.sh`

**Interfaces:**
- Produces: `mergeManifestEntries({ manifest, catalogManifest }) -> Array<[key, entry]>`, `buildCatalog({ manifests, taxonomy, thumbIndex }) -> { entries, sections, stats }`

- [ ] **Step 1: Test that merging preserves disjoint keyspaces and is order-stable**

Assert `mergeManifestEntries` returns `manifest.json` entries before `catalog-manifest.json` entries, and that a duplicate key across sources throws (the gate's guard (G) invariant, asserted client-side too).

- [ ] **Step 2: Run test to verify it fails**, then implement, then verify PASS.

- [ ] **Step 3: Add the CI step**

In `.github/workflows/ci.yml`, after the "Story explorer smoke test" step:

```yaml
      # Asset storybook (F-038): pure data layer — taxonomy resolution,
      # manifest merge, thumb-index join. No DOM, so node --test covers it.
      - name: Asset storybook data-layer tests
        run: node --test tools/asset-storybook/tests/*.test.mjs
```

In `scripts/precheck.sh`, add a matching `run_section` beside `art_forge_tests`.

- [ ] **Step 4: Verify both actually run**

```bash
bash scripts/precheck.sh 2>&1 | grep -i storybook
```
Expected: the section appears and passes. Confirm the CI YAML parses: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`.

- [ ] **Step 5: Commit**

```bash
git add tools/asset-storybook .github/workflows/ci.yml scripts/precheck.sh
git commit -m "test(storybook): pure data layer under node --test, wired into CI + Gate 1"
```

---

## Task 11: VirtualGrid

**Files:**
- Create: `tools/asset-storybook/js/view/VirtualGrid.mjs`
- Create: `tools/asset-storybook/js/view/Card.mjs`
- Modify: `tools/asset-storybook/js/main.mjs`

**Interfaces:**
- Consumes: `buildCatalog` output; `Card.build(key, entry, ctx) -> HTMLElement`
- Produces: `new VirtualGrid({ container, items, buildCard, itemHeight, columns }) -> { destroy(), scrollToKey(key), setItems(items) }`

- [ ] **Step 1: Implement windowing**

Render a spacer div sized to `ceil(items.length / columns) * itemHeight` so scroll height stays truthful. On `scroll` (rAF-throttled) and `resize`, compute the visible row range ± 2 rows of overscan, and mount only those cards, recycling detached elements from a pool.

- [ ] **Step 2: Health must not depend on mounting**

Because cards mount and unmount, `bumpHealth` from a card's `img` would double-count. Instead, on grid construction, kick a **bounded** preload (concurrency 8) of every item's thumbnail via `new Image()`, bumping health once per item. Cards then render from the browser cache.

- [ ] **Step 3: Verify the two headline numbers**

```js
({ nodes: document.getElementsByTagName('*').length,
   mv: document.querySelectorAll('model-viewer').length })
```
Expected: `nodes < 400` (baseline 11,268), `mv: 0`. Scroll to the bottom and re-run — `nodes` must stay bounded.

- [ ] **Step 4: Re-verify health still settles** (the Task 9 console check) — `[]`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write tools/asset-storybook/js
git add tools/asset-storybook/js
git commit -m "perf(storybook): virtualized grid — DOM bounded regardless of catalog size"
```

---

## Task 12: DetailOverlay — the single live `<model-viewer>`

**Files:**
- Create: `tools/asset-storybook/js/view/DetailOverlay.mjs`
- Modify: `tools/asset-storybook/index.html` (overlay styles)

**Interfaces:**
- Consumes: the `RENDERERS` map from `renderers.mjs` (reused for the live view), `resolveRender`.
- Produces: `openDetail({ key, entry, index, items }) -> void`, `closeDetail() -> void`

- [ ] **Step 1: Mount on open, dispose on close**

On open, build the live viewport via the existing `RENDERERS[render]` builder and append it. On close, for a `model-viewer`: `mv.pause(); mv.removeAttribute("src"); mv.remove();` — removing `src` before removal is what actually frees the GPU resources.

- [ ] **Step 2: Keyboard navigation**

`Escape` closes. `ArrowLeft` / `ArrowRight` move to the previous/next item **in the current filtered list**, disposing and remounting. Focus is trapped in the overlay while open.

- [ ] **Step 3: Verify the 643 → 1 claim**

```js
document.querySelectorAll('model-viewer').length            // 0
document.querySelector('.card').click();
document.querySelectorAll('model-viewer').length            // 1
document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
document.querySelectorAll('model-viewer').length            // 0
```
All three assertions must hold.

- [ ] **Step 4: Commit**

```bash
npx prettier --write tools/asset-storybook/js tools/asset-storybook/index.html
git add tools/asset-storybook
git commit -m "feat(storybook): detail overlay with a single live model-viewer"
```

---

## Task 13: Shrink `main.mjs` to composition

**Files:**
- Modify: `tools/asset-storybook/js/main.mjs`

- [ ] **Step 1: Reduce `init()` to fetch → buildCatalog → mount sidebar → mount VirtualGrid → mount overlay → mount bespoke sections (SFX, Music, Art, Coverage, Combat).** Every branch of logic moves into `data/` or `view/`. Target: **`main.mjs` under 120 lines** (from 362).

- [ ] **Step 2: Confirm `resolve_render_mirror.test.mjs` still passes.** If the `resolveRender` block moved file, update `STORYBOOK_FILE` in that test — never `BLOCK_PATTERN`.

Run: `node --test scripts/tests/resolve_render_mirror.test.mjs`
Expected: PASS

- [ ] **Step 3: Commit**, then **Phase 3 quality gate** (independent review of the phase diff, refactor, re-verify all measurements).

---

# Phase 4 — Review layer

## Task 14: Verdict store

**Files:**
- Create: `content/review-queue.json` (seed: `{ "version": 1, "verdicts": {} }`)
- Create: `tools/asset-storybook/js/review/store.mjs`
- Create: `tools/asset-storybook/tests/review-store.test.mjs`

**Interfaces:**
- Produces:
  - `createStore({ committed, local }) -> store`
  - `store.get(key) -> { verdict: "reject"|"rebuild", note: string } | null`
  - `store.set(key, verdict, note) -> void` — **throws** on a verdict outside `{reject, rebuild}` or an empty/whitespace note
  - `store.clear(key) -> void`
  - `store.unsavedCount() -> number`
  - `store.exportJson() -> string` (committed ∪ local, stable key order)

- [ ] **Step 1: Write the failing test**

Cover: local overrides committed for the same key; `set` with verdict `"maybe"` throws; `set` with note `"   "` throws; `unsavedCount` counts only keys differing from committed; `exportJson` output is byte-stable across two calls with keys inserted in different orders.

- [ ] **Step 2: Run to verify it fails**, implement, verify PASS.

- [ ] **Step 3: Commit.**

---

## Task 15: Verdict UI on card and overlay

**Files:**
- Create: `tools/asset-storybook/js/review/ui.mjs`
- Modify: `tools/asset-storybook/js/view/Card.mjs`, `js/view/DetailOverlay.mjs`, `index.html`

- [ ] **Step 1:** Each card gets two buttons — **Reject** and **Rebuild** — which open a small inline note field. Saving without a note is refused with visible inline text (the store throws; the UI must not swallow it). A card carrying a verdict gets a coloured border: red for `reject`, amber for `rebuild`.
- [ ] **Step 2:** The overlay carries the same controls, larger, plus the existing note if any.
- [ ] **Step 3:** Verify a mark survives reload (localStorage) and that reloading does not duplicate it.
- [ ] **Step 4: Commit.**

---

## Task 16: Unsaved bar + export

**Files:** Modify `tools/asset-storybook/js/review/ui.mjs`, `index.html`

- [ ] **Step 1:** A fixed bottom bar appears whenever `store.unsavedCount() > 0`, reading `N unsaved marks — Export`.
- [ ] **Step 2:** Export triggers a download of `review-queue.json` via a `Blob` + object URL, and offers a "Copy JSON" fallback.
- [ ] **Step 3:** Verify the exported file, dropped into `content/review-queue.json` and reloaded, makes `unsavedCount()` return `0` with the marks still shown.
- [ ] **Step 4: Commit.**

---

## Task 17: Compare tray

**Files:** Modify `tools/asset-storybook/js/review/ui.mjs`, `index.html`

- [ ] **Step 1:** Shift-click pins a card into a bottom tray (thumbnail + key, max 6, ephemeral — no persistence).
- [ ] **Step 2:** Clicking the tray expands to a side-by-side view of the pinned thumbnails at full 256 px.
- [ ] **Step 3:** Verify pinning 4 assets across different sections and expanding shows all 4; reload clears the tray.
- [ ] **Step 4: Commit.**

---

## Task 18: Verdict filters

**Files:** Modify `tools/asset-storybook/js/sidebar.mjs`, `js/main.mjs`

- [ ] **Step 1:** Add `Rejected`, `Needs rebuild`, `Unreviewed` sidebar items with live counts.
- [ ] **Step 2:** Selecting one calls `VirtualGrid.setItems(filtered)` — filtering re-windows rather than hiding DOM, so a filter on 742 items stays instant.
- [ ] **Step 3:** Verify `Unreviewed` count + `Rejected` + `Needs rebuild` equals the total entry count, always.
- [ ] **Step 4: Commit.**

- [ ] **Step 5: Phase 4 quality gate**, then run the **full verification table** from spec §5 and record every number against its baseline before shipping.

---

## Final verification (run before `/ps-release-workflow:ship`)

```bash
node --test scripts/tests/*.test.mjs
node --test tools/asset-storybook/tests/*.test.mjs
node scripts/check_asset_manifest.mjs
node scripts/bake_thumbnails.mjs      # must report 0 baked, 0 failed — everything already fresh
bash scripts/precheck.sh
```

Then, in Chrome against `python3 -m http.server 8765`:

| Measure | Baseline | Required |
| --- | --- | --- |
| `document.getElementsByTagName('*').length` | 11,268 | **< 400** |
| Σ `transferSize` | 16.4 MB | **< 2 MB** |
| `querySelectorAll('model-viewer').length` at rest | 643 | **0** |
| ...with overlay open | — | **1** |
| Sidebar dots at `loading…` | 11 of 23 | **0** |
| Section labels matching `/^Model3d:/` | 1 | **0** |
