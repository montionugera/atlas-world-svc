# F-042 World Map Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render two committed, deterministic parchment map sheets from the F-041 tier spine — a new 2000×2000 km world/atlas sheet and the continent/basin sheet re-rendered from spine truth — with a CI drift gate keeping them fresh.

**Architecture:** Extract the drafting primitives of `tools/mapforge/render-map.mjs` into `tools/mapforge/lib/` behind a characterization (byte-parity) test, then add a spine-driven entry point `render-sheet.mjs` whose `cluster1` sheet reuses `emitGeography()` from `scripts/check_spine_emit.mjs` (guaranteeing identity with the mirror path) and whose `atlas` sheet is new drawing code over the same lib. A new `scripts/check_map_render.mjs` byte-compares committed SVGs in CI.

**Tech Stack:** Plain Node ESM (`.mjs`), zero runtime deps, `node --test` for tests, `rsvg-convert` for PNG rasters.

**Canonical spec:** `docs/superpowers/specs/2026-08-12-world-map-render-design.md` (owner-approved 2026-08-12).

## Global Constraints

- **Determinism:** no `Math.random`, no `Date`; identical input → byte-identical SVG. `r2()` rounding (2 decimals, −0 normalized) everywhere.
- **Byte parity:** post-refactor `render-map.mjs` output must equal the pre-refactor baseline byte-for-byte (Task 1 fixture), and `render-sheet.mjs --sheet cluster1` must equal it too.
- **`render-map.mjs --check` must never go dark** — it is wired at `scripts/integration.sh:112` and is the only town-in-zone enforcement.
- **Fiction tree only:** draw from root `n-atlas`; never draw the `n-playroot` runtime tree; no file under `content/maps/` changes.
- **Raster policy:** `rsvg-convert` only (`-w 2000 -b "#f3e7ce"`). Remove the ImageMagick fallback *suggestion text*; never invoke `magick` (it silently drops strokes without the librsvg delegate).
- **No invented geography:** every drawn element traces to a spine node, feature, edge, or a `sheet-atlas.json` presentation string.
- **Branch/worktree:** feature branch off `release/1.8` (spine absent on `main`). Fresh worktree: run `(cd scripts && npm ci)` before any test task.
- Conventional commit subjects; one commit per task; never `git commit --amend`.
- **Per-task quality gate (global rule 7):** every task ends verify → independent review → refactor → re-verify before the next task starts (subagent-driven-development's two-stage review satisfies this).

---

### Task 1: Baseline fixture + test harness

The committed `cluster1-world.svg` is STALE relative to current data (F-041 redrew boundaries in the mirror but pinned the SVG unchanged), so the parity baseline is *the current renderer's output on current data*, not the committed file.

**Files:**
- Create: `tools/mapforge/tests/fixtures/basin-baseline.svg`
- Create: `tools/mapforge/tests/parity.test.mjs`
- Test: `tools/mapforge/tests/parity.test.mjs`

**Interfaces:**
- Consumes: `tools/mapforge/render-map.mjs` (unmodified legacy renderer).
- Produces: the fixture file + a runnable test harness (`node --test tools/mapforge/tests/`) later tasks keep green.

- [ ] **Step 1: Capture the baseline**

```bash
cd <feature-worktree-root>
node tools/mapforge/render-map.mjs --no-png
mkdir -p tools/mapforge/tests/fixtures
cp game-client/assets/art/maps/cluster1-world.svg tools/mapforge/tests/fixtures/basin-baseline.svg
git checkout -- game-client/assets/art/maps/cluster1-world.svg   # keep committed artifact untouched for now
```

Expected: renderer exits 0 (its `--check` problems list empty). The fixture differs from the committed SVG (redrawn boundaries) — that is expected and is the point.

- [ ] **Step 2: Write the characterization test**

```js
// tools/mapforge/tests/parity.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const OUT = join(ROOT, "game-client/assets/art/maps/cluster1-world.svg");
const FIXTURE = join(HERE, "fixtures/basin-baseline.svg");

test("render-map.mjs reproduces the baseline byte-for-byte", () => {
  execFileSync(process.execPath, [join(ROOT, "tools/mapforge/render-map.mjs"), "--no-png"], { stdio: "pipe" });
  const got = readFileSync(OUT, "utf8");
  execFileSync("git", ["checkout", "--", OUT], { cwd: ROOT });
  assert.equal(got, readFileSync(FIXTURE, "utf8"));
});
```

- [ ] **Step 3: Run it — must PASS (characterization, not red-green)**

Run: `node --test tools/mapforge/tests/`
Expected: 1 pass. This test is the safety net for Tasks 2–4; it must stay green through every refactor step.

- [ ] **Step 4: Commit**

```bash
git add tools/mapforge/tests/
git commit -m "test(mapforge): baseline fixture + byte-parity characterization test"
```

---

### Task 2: Extract `lib/draft.mjs` (pure drafting primitives)

Mechanical move of transform-closured helpers into a factory. No behavior change; parity test is the gate.

**Files:**
- Create: `tools/mapforge/lib/draft.mjs`
- Modify: `tools/mapforge/render-map.mjs` (replace moved code with imports; lines cited from current file: helpers at 70–204, 321–397, 446, 616, 809; constants at 46–65, 402, 512, 569)
- Test: existing `tools/mapforge/tests/parity.test.mjs`

**Interfaces:**
- Produces (exact exports of `lib/draft.mjs`):

```js
export const C = { parchment: "#f3e7ce", parchmentDeep: "#efe4ca", sea: "#dcd0b0", ink: "#241f18",
  ink2: "#4c443714", inkMid: "#5d5344", inkSoft: "#8a7f6c", accent: "#a86f22", accentSoft: "#c8933f" };
export const ZONE_TENSION = 10;
export const REACH_W = { "the-heads": 1.4, "upper-meltwash": 2.4, "tidal-reach": 3.6 };
export const ROAD_W = { trunk: 3.2, spur: 2.2, track: 1.5 };
export const FILL_FOR = { ice: "pIce", upland: "pUpland", "alkali-flat": "pFlat", rim: "pRim",
  bramble: "pBramble", headland: "pRock", "river-country": "pRiver" };
export const TERRAIN_LEGEND = [/* moved verbatim from render-map.mjs:902 */];
export const r2 = (n) => { const v = Math.round(n * 100) / 100; return Object.is(v, -0) ? 0 : v; };
export const esc = (s) => /* moved verbatim */;
export function centroid(polygon) {}
export function pointInPolygon(pt, polygon) {}
export function polylineKm(points) {}
export function alongKm(points, d) {}
export function offsetKm(points, d) {}
export function wrap(text, max) {}
export const pat = (id, w, h, body, transform = "") => /* moved verbatim */;
export function patternDefs() {}   // returns the 8 <pattern> strings (render-map.mjs:327-397) joined
export function createDraft({ pxPerKm, mapLeft, mapTop }) {
  // returns the transform-closured helpers, bodies moved verbatim:
  // { X, Y, poly, smooth, lineLabel, towerGlyph }
}
```

- Consumes: nothing new.

- [ ] **Step 1: Create `lib/draft.mjs`** — move each listed function/constant verbatim (cut-paste, only wrapping the transform-dependent six in `createDraft`).
- [ ] **Step 2: Rewire `render-map.mjs`** — `import { C, ZONE_TENSION, REACH_W, ROAD_W, FILL_FOR, TERRAIN_LEGEND, r2, esc, centroid, pointInPolygon, polylineKm, alongKm, offsetKm, wrap, patternDefs, createDraft } from "./lib/draft.mjs";` then `const { X, Y, poly, smooth, lineLabel, towerGlyph } = createDraft({ pxPerKm: PX_PER_KM, mapLeft: MAP_LEFT, mapTop: MAP_TOP });` — delete the moved bodies.
- [ ] **Step 3: Verify parity**

Run: `node --test tools/mapforge/tests/` and `node tools/mapforge/render-map.mjs --check`
Expected: parity test PASS, `--check` exit 0.

- [ ] **Step 4: Commit**

```bash
git add tools/mapforge/lib/draft.mjs tools/mapforge/render-map.mjs
git commit -m "refactor(mapforge): extract drafting primitives into lib/draft.mjs (byte-parity kept)"
```

---

### Task 3: Extract `lib/basin-sheet.mjs` (the basin sheet as a function)

Turn the straight-line script body (load→check→draw→join, render-map.mjs:222–1006) into an importable draw function; `render-map.mjs` becomes a thin CLI.

**Files:**
- Create: `tools/mapforge/lib/basin-sheet.mjs`
- Modify: `tools/mapforge/render-map.mjs`
- Test: existing parity test + new `tools/mapforge/tests/basin-sheet.test.mjs`

**Interfaces:**
- Produces:

```js
// tools/mapforge/lib/basin-sheet.mjs
export function drawBasinSheet({ doc }) {
  // doc = parsed cluster1-geography.json shape
  // returns { svg: string, notes: string[], problems: string[] }
  // moved verbatim: self-check block (222-298 minus file loading), sheet-size derivation (300-306),
  // the whole draw pass (308-990), join (992). Panel cursor state stays internal.
}
```

- Consumes: everything exported by `lib/draft.mjs` (Task 2 signatures).
- `render-map.mjs` post-task shape (thin CLI, ~40 lines): parse argv (`--no-png`, `--check` — unchanged semantics), `JSON.parse(readFileSync(SRC))`, call `drawBasinSheet`, print notes, on `problems.length` print + `process.exit(1)`, else write SVG (unless `--check`), then PNG via `rasterize` (Task 5 will move it; for now keep the inline rsvg block).

- [ ] **Step 1: Write the new unit test first**

```js
// tools/mapforge/tests/basin-sheet.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drawBasinSheet } from "../lib/basin-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const doc = JSON.parse(readFileSync(join(ROOT, "content/maps/cluster1-geography.json"), "utf8"));

test("drawBasinSheet matches the baseline fixture", () => {
  const { svg, problems } = drawBasinSheet({ doc });
  assert.deepEqual(problems, []);
  assert.equal(svg, readFileSync(join(HERE, "fixtures/basin-baseline.svg"), "utf8"));
});

test("drawBasinSheet flags a town outside its zone", () => {
  const bad = structuredClone(doc);
  bad.towns[0].at = [-999, -999];
  const { problems } = drawBasinSheet({ doc: bad });
  assert.ok(problems.some((p) => p.includes(bad.towns[0].id)));
});
```

- [ ] **Step 2: Run — FAIL** (`Cannot find module '../lib/basin-sheet.mjs'`). Run: `node --test tools/mapforge/tests/`
- [ ] **Step 3: Implement** — move the code as described in Interfaces; note the baseline SVG ends `o.join("\n") + "\n"` — preserve exactly.
- [ ] **Step 4: Run all tests + `--check`** — parity, basin-sheet, `node tools/mapforge/render-map.mjs --check` all green.
- [ ] **Step 5: Commit** — `git commit -m "refactor(mapforge): basin sheet as drawBasinSheet(); render-map.mjs is a thin CLI"`

---

### Task 4: `render-sheet.mjs --sheet cluster1` (spine data path)

The spine-driven path: `loadSpine` → `buildTree` → `emitGeography` → parse → `drawBasinSheet`. Byte-identical by construction; a test proves it.

**Files:**
- Create: `tools/mapforge/render-sheet.mjs`
- Test: `tools/mapforge/tests/render-sheet.test.mjs`

**Interfaces:**
- Consumes: `drawBasinSheet({doc})` (Task 3); `loadSpine({contentRoot})`, `buildTree({nodes, rootIds})` from `scripts/lib/spine.mjs`; `emitGeography({spine, tree})` (returns a canonical JSON **string**) from `scripts/check_spine_emit.mjs`.
- Produces (used by Tasks 5–7):

```js
// tools/mapforge/render-sheet.mjs
export const SHEETS = {
  cluster1: {
    outSvg: "game-client/assets/art/maps/cluster1-world.svg",
    outPng: "game-client/assets/art/maps/cluster1-world.png",
    build: buildCluster1Sheet,   // ({repoRoot}) => { svg, notes, problems }
  },
  atlas: { /* added in Task 6 */ },
};
export function buildCluster1Sheet({ repoRoot }) {
  const spine = loadSpine({ contentRoot: join(repoRoot, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const doc = JSON.parse(emitGeography({ spine, tree }));
  return drawBasinSheet({ doc });
}
// CLI (import.meta.url-guarded main, same pattern as check_spine_emit.mjs:258):
//   node tools/mapforge/render-sheet.mjs --sheet <id> [--no-png] [--check]
//   --check: build, print problems, exit 1 if any OR if built svg !== committed svg; write nothing.
```

- [ ] **Step 1: Write the failing test**

```js
// tools/mapforge/tests/render-sheet.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCluster1Sheet } from "../render-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

test("spine-driven cluster1 sheet is byte-identical to the mirror-driven baseline", () => {
  const { svg, problems } = buildCluster1Sheet({ repoRoot: ROOT });
  assert.deepEqual(problems, []);
  assert.equal(svg, readFileSync(join(HERE, "fixtures/basin-baseline.svg"), "utf8"));
});

test("building twice is deterministic", () => {
  assert.equal(buildCluster1Sheet({ repoRoot: ROOT }).svg, buildCluster1Sheet({ repoRoot: ROOT }).svg);
});
```

- [ ] **Step 2: Run — FAIL** (module missing). Run: `node --test tools/mapforge/tests/`
- [ ] **Step 3: Implement `render-sheet.mjs`** per Interfaces (CLI writes `SHEETS[id].outSvg`, PNG via the same inline rsvg pattern for now).
- [ ] **Step 4: Run tests — PASS**, plus `node tools/mapforge/render-sheet.mjs --sheet cluster1 --check` → currently exits 1 with a "stale committed svg" message (committed file predates the boundary redraw). That exit-1 is CORRECT here; the recommit happens in Task 7.
- [ ] **Step 5: Commit** — `git commit -m "feat(mapforge): spine-driven render-sheet.mjs; cluster1 sheet byte-equal to mirror path"`

---

### Task 5: Shared rasterize helper + rsvg-only policy

**Files:**
- Create: `tools/mapforge/lib/raster.mjs`
- Modify: `tools/mapforge/render-map.mjs` (replace inline block at old lines 1015–1038), `tools/mapforge/render-sheet.mjs`, `tools/mapforge/README.md`
- Test: `tools/mapforge/tests/raster.test.mjs`

**Interfaces:**
- Produces:

```js
// tools/mapforge/lib/raster.mjs
import { spawnSync } from "node:child_process";
export function rasterize({ svgPath, pngPath, width = 2000, background = "#f3e7ce" }) {
  const probe = spawnSync("rsvg-convert", ["--version"], { stdio: "pipe" });
  if (probe.error || probe.status !== 0) {
    return { ok: false, skipped: true, message: "rsvg-convert not found — PNG skipped. Install librsvg (brew install librsvg). Do NOT substitute ImageMagick: without the librsvg delegate it silently drops every stroke." };
  }
  const run = spawnSync("rsvg-convert", ["-w", String(width), "-b", background, svgPath, "-o", pngPath], { stdio: "pipe" });
  if (run.status !== 0) return { ok: false, skipped: false, message: String(run.stderr) };
  return { ok: true, skipped: false, message: `wrote ${pngPath}` };
}
```

- Callers: both CLIs call `rasterize(...)`; non-`ok` non-`skipped` → exit 1 (matches legacy behavior); `skipped` → print message, exit 0.

- [ ] **Step 1: Write the failing test** — `rasterize({svgPath: <fixture>, pngPath: <tmpdir>/out.png})` returns `ok:true` and the PNG exists & is non-empty (skip the assertion with `t.skip()` if the probe reports rsvg-convert missing, so CI without librsvg stays green).
- [ ] **Step 2: Run — FAIL**, implement, **run — PASS**.
- [ ] **Step 3: Sweep the magick fallback** — `grep -rn "magick\|ImageMagick" tools/mapforge/` → remove the fallback suggestion from renderer output text and README; keep only the rsvg-convert instruction + warning above.
- [ ] **Step 4: All tests + both CLIs `--check` still behave; commit** — `git commit -m "refactor(mapforge): shared rsvg-only rasterize helper; remove ImageMagick fallback suggestion"`

---

### Task 6: The atlas sheet (`sheet-atlas.json` + `lib/atlas-sheet.mjs`)

**Files:**
- Create: `content/spine/sheet-atlas.json`
- Create: `tools/mapforge/lib/atlas-sheet.mjs`
- Modify: `tools/mapforge/render-sheet.mjs` (register `atlas` in `SHEETS`)
- Test: `tools/mapforge/tests/atlas-sheet.test.mjs`

**Interfaces:**
- Consumes: `createDraft`/`C`/`smooth`-family from `lib/draft.mjs`; `loadSpine`, `buildTree`, `resolveToRoot` from `scripts/lib/spine.mjs`; `rasterize` (Task 5).
- Produces:

```js
// tools/mapforge/lib/atlas-sheet.mjs
export const ATLAS_PX_PER_KM = 0.7;   // 2000 km → 1400 px map frame
export const ATLAS_MAP_LEFT = 58;
export const ATLAS_MAP_TOP = 96;
export function drawAtlasSheet({ spine, tree, sheet }) {
  // sheet = parsed content/spine/sheet-atlas.json
  // returns { svg: string, problems: string[] }
}
export function buildAtlasSheet({ repoRoot }) {}  // loads spine + sheet-atlas.json, calls drawAtlasSheet
```

**`content/spine/sheet-atlas.json` (authored copy — owner may reword strings later; structure is fixed):**

```json
{
  "title": "THE ATLAS WORLD",
  "subtitle": "such ground as the Bellfaith can vouch for",
  "hand": "A world sheet drawn by the same hands that keep the basin map. It records what has been walked, sounded, or seen from a tower; it does not guess. The empty parchment is not modesty — it is the honest extent of the survey.",
  "noScaleBar": true,
  "scaleBarNote": "no scale bar; distances inside the surveyed ground are the basin sheet's business",
  "northMark": { "at": [1840, 1900], "label": "N" },
  "surveyNote": "surveyed ground: see the basin sheet — CLUSTER 1 · THE MELTWASH BASIN",
  "withheld": [
    "every coast, reef and landmass beyond a day's sail of Gildmark",
    "whatever lies past the ice",
    "the far shore of the western sea, if it has one"
  ]
}
```

**Drawn elements (each traces to spine data or the sheet record — Global Constraint):**

1. Parchment sheet: `ATLAS_MAP_LEFT + 2000·0.7 + 46` wide (≈1504 px), frame border, `C` palette, same font/halo classes.
2. Basin miniature: `n-cluster1` `placement` polygon (outline, `smooth` with `ZONE_TENSION`), `f-west-coast` coastline + sea fill west of it, `f-the-meltwash` river as one 1 px smoothed line, all in atlas-km (the spine's shared-grid rule: these coords are already n-atlas frame km).
3. `n-westsea` `placement` polygon with the `C.sea` fill.
4. One dot (`r` 1.6 px, class `town-dot`) per `tier === "town"` node at `resolveToRoot({tree, id, point: placement.anchor-in-parent-frame})`; **no per-town labels**.
5. Basin label: `sheet-atlas.json.surveyNote` text placed right of the miniature.
6. Sea-lane: the `offSheet` sea-lane point + arrow leaving the basin (from `n-cluster1` features / `edges.json` sealane), season mark as in the basin sheet.
7. Chrome from the sheet record: title, subtitle, hand note (wrapped with `wrap()`), withheld list, north mark. **Nothing else** — no roads (subpixel), no zone fills, no invented coastlines.

**Problems list (self-checks):** any town dot outside the `n-cluster1` polygon; any drawn coordinate outside the 2000×2000 frame except declared `offSheet` points; `tier === "town"` count ≠ dot count.

- [ ] **Step 1: Write the failing tests**

```js
// tools/mapforge/tests/atlas-sheet.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAtlasSheet } from "../lib/atlas-sheet.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("atlas sheet renders with no problems and is deterministic", () => {
  const a = buildAtlasSheet({ repoRoot: ROOT });
  const b = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(a.problems, []);
  assert.equal(a.svg, b.svg);
});

test("one town dot per town-tier node, no town labels", () => {
  const { svg } = buildAtlasSheet({ repoRoot: ROOT });
  const dots = svg.match(/class="town-dot"/g) ?? [];
  assert.equal(dots.length, 7);            // millcross, rooktide, embervale, norhollow, gildmark, cindervast-town, expedition-camp
  assert.ok(!svg.includes(">Millcross<"));
});

test("world sheet title comes from the sheet record", () => {
  const { svg } = buildAtlasSheet({ repoRoot: ROOT });
  assert.ok(svg.includes("THE ATLAS WORLD"));
});
```

- [ ] **Step 2: Run — FAIL.** Run: `node --test tools/mapforge/tests/`
- [ ] **Step 3: Author `content/spine/sheet-atlas.json`** exactly as above. Note: `loadSpine` does not read this file — `buildAtlasSheet` reads it directly (`JSON.parse(readFileSync(join(repoRoot, "content/spine/sheet-atlas.json")))`). Confirm `scripts/check_spine_emit.mjs --check` still passes (it must not treat the new file as drift; if its directory walk complains, add the filename to its ignore list — this is the only permitted `scripts/` touch in this task).
- [ ] **Step 4: Implement `lib/atlas-sheet.mjs` + register in `SHEETS`** — `atlas: { outSvg: "game-client/assets/art/maps/atlas-world.svg", outPng: "game-client/assets/art/maps/atlas-world.png", build: buildAtlasSheet }`.
- [ ] **Step 5: Run all mapforge tests — PASS**; also `node tools/mapforge/render-sheet.mjs --sheet atlas --no-png` writes the SVG; open it once in Chrome (`open -a "Google Chrome" game-client/assets/art/maps/atlas-world.svg`) for a human-eyeball sanity check of composition.
- [ ] **Step 6: Discard the working-tree SVG (`git checkout --` it if written), commit code + sheet record only** — `git commit -m "feat(mapforge): world/atlas sheet — sheet-atlas.json record + drawAtlasSheet"`

---### Task 7: Commit the rendered artifacts + manifest entry

**Files:**
- Modify: `game-client/assets/art/maps/cluster1-world.svg`, `cluster1-world.png` (re-rendered — boundary redraw now baked in)
- Create: `game-client/assets/art/maps/atlas-world.svg`, `atlas-world.png`
- Modify: `game-client/assets/art/art-manifest.json` (add `art:map-atlas` after `art:map-cluster1`; also update `art:map-cluster1.gen.tool/input` to name `tools/mapforge/render-sheet.mjs` + `content/spine/` as the source of truth)
- Test: existing gates

**Interfaces:**
- Consumes: `render-sheet.mjs` CLI (Task 4/6).
- Produces: committed artifacts Task 8's drift gate locks in.

**`art:map-atlas` manifest entry:**

```json
"art:map-atlas": {
  "group": "map",
  "title": "The Atlas World — surveyed ground",
  "file": "maps/atlas-world.png",
  "note": "AUTHORED VECTOR, NOT GENERATED. Drawn by tools/mapforge/render-sheet.mjs --sheet atlas from content/spine/ (nodes + sheet-atlas.json); the SVG beside this PNG (maps/atlas-world.svg) is the artifact, the PNG is a 2000px raster of it for the storybook.",
  "description": "The world sheet: the full 2000×2000 km frame of n-atlas with the Meltwash basin drawn as a surveyed miniature in its corner — coastline, river, continent outline and seven town marks — the western sea strip, the Gildmark sea-lane leaving the sheet with its season, and honest empty parchment everywhere the survey has never reached. No scale bar; the hand note says why.",
  "tags": ["world", "map", "bellfaith", "authored-vector", "svg", "spine"],
  "source": "docs/superpowers/specs/2026-08-12-world-map-render-design.md",
  "gen": {
    "method": "authored-vector", "generated": false,
    "tool": "tools/mapforge/render-sheet.mjs",
    "input": "content/spine/",
    "vector": "maps/atlas-world.svg",
    "raster": "rsvg-convert -w 2000",
    "deterministic": true, "width": 2000,
    "note": "No model, no sampler, no seed — drawn from spine geometry. Re-run the tool to reproduce it byte-for-byte."
  }
}
```

- [ ] **Step 1: Render + rasterize both sheets**

```bash
node tools/mapforge/render-sheet.mjs --sheet cluster1
node tools/mapforge/render-sheet.mjs --sheet atlas
```

Expected: 4 files written (2 SVG, 2 PNG). If PNG is skipped, install librsvg first — the PNGs are deliverables.

- [ ] **Step 2: Add the manifest entry** (verbatim above) and update `art:map-cluster1.gen` (`"tool": "tools/mapforge/render-sheet.mjs"`, `"input": "content/spine/"`, and append to `note`: "Since F-042 the sheet renders from content/spine/ via render-sheet.mjs; content/maps/cluster1-geography.json remains a generated mirror.").
- [ ] **Step 3: Verify gates**

```bash
node scripts/check_asset_manifest.mjs        # manifest + coverage: new PNG claimed
node scripts/check_spine_emit.mjs --check    # mirror drift still green
node tools/mapforge/render-map.mjs --check   # legacy check still green
node --test tools/mapforge/tests/
node tools/mapforge/render-sheet.mjs --sheet cluster1 --check && node tools/mapforge/render-sheet.mjs --sheet atlas --check
```

Expected: all exit 0 (the `--check` staleness from Task 4 is now resolved by the recommit).

- [ ] **Step 4: Eyeball both PNGs in the storybook** — serve `tools/asset-storybook/` the way its README says and confirm the "Maps (2)" section shows both cards with images loading (health dot green). Screenshot or state the observed result in the task report — HTTP 200 alone is not proof (memory: http-status-is-not-proof).
- [ ] **Step 5: Commit** — `git add game-client/assets/art/maps/ game-client/assets/art/art-manifest.json && git commit -m "feat(art): atlas world sheet + spine-rendered basin sheet (art:map-atlas)"`

---

### Task 8: CI drift gate `scripts/check_map_render.mjs` + wiring

**Files:**
- Create: `scripts/check_map_render.mjs`
- Create: `scripts/tests/check_map_render.test.mjs`
- Modify: `.github/workflows/ci.yml` (new step after the spine emit drift-gate at line ~111), `scripts/integration.sh` (new `run_section` next to `mapforge_check` at line ~112, plus a mapforge test-suite section)

**Interfaces:**
- Consumes: `SHEETS` from `tools/mapforge/render-sheet.mjs`.
- Produces:

```js
// scripts/check_map_render.mjs
import { SHEETS } from "../tools/mapforge/render-sheet.mjs";
export function checkMapRender({ repoRoot }) {
  // for each sheet id: build(); compare svg bytes to readFileSync(join(repoRoot, outSvg))
  // → { stale: string[], problems: string[] }   (missing committed file counts as stale)
}
// CLI: --check (default) → exit 1 listing stale/problem sheets with the fix command
//      --write            → write all sheet SVGs+PNGs (the regenerate path)
// main() guarded by import.meta.url, same pattern as check_spine_emit.mjs:233,258
```

- [ ] **Step 1: Write the failing test**

```js
// scripts/tests/check_map_render.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkMapRender } from "../check_map_render.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("committed sheets are fresh", () => {
  const { stale, problems } = checkMapRender({ repoRoot: ROOT });
  assert.deepEqual({ stale, problems }, { stale: [], problems: [] });
});

test("a stale committed sheet is detected", async (t) => {
  // copy the repo's real committed svg to a tmp repoRoot layout, truncate it, expect stale
  // (build against the REAL content/ by symlinking content/ + tools/ into the tmp root;
  //  only game-client/assets/art/maps/ is a mutated copy)
  const tmp = await import("node:fs/promises").then((fs) => fs.mkdtemp("/tmp/cmr-"));
  // ... build tmp layout: symlink content, scripts, tools; copy game-client tree; truncate cluster1-world.svg
  const { stale } = checkMapRender({ repoRoot: tmp });
  assert.ok(stale.includes("cluster1"));
});
```

(If the symlink layout fights `loadSpine`'s path handling, drop the second test to an integration check instead: temporarily truncate the real file, assert stale, `git checkout --` restore inside the same test with try/finally. Either variant is acceptable; delete the one not used.)

- [ ] **Step 2: Run — FAIL**, implement, **run — PASS** (`cd scripts && npm test` — the suite globs `tests/*.test.mjs`).
- [ ] **Step 3: Wire CI** — `.github/workflows/ci.yml`, immediately after the spine drift step:

```yaml
      - name: Map render drift-gate (G-MAP-DRIFT)
        run: node scripts/check_map_render.mjs
```

And `scripts/integration.sh`, next to the existing mapforge section:

```sh
map_render_drift() { node "$REPO_ROOT/scripts/check_map_render.mjs"; }
mapforge_tests() { node --test "$REPO_ROOT/tools/mapforge/tests/"; }
run_section "content: map render drift (G-MAP-DRIFT)" map_render_drift
run_section "content: mapforge test suite" mapforge_tests
```

- [ ] **Step 4: Prove the gate red-then-green locally** — truncate `game-client/assets/art/maps/atlas-world.svg`, run `node scripts/check_map_render.mjs` → exit 1 naming `atlas`; `git checkout --` restore; rerun → exit 0. Record both outputs in the task report.
- [ ] **Step 5: Full local gate pass** — `bash scripts/precheck.sh` and `bash scripts/integration.sh` (or the sections it can run locally) green.
- [ ] **Step 6: Commit** — `git commit -m "feat(gates): G-MAP-DRIFT — committed map sheets must match spine render"`

---

## Ship checklist (after Task 8)

1. All mapforge tests + scripts tests green; `precheck.sh` green (Gate 1).
2. **Owner boundary-redraw ack recorded** in `docs/worldbuilding/spine-migration/boundary-changes.md` (also blocks 1.8 promote) — the re-rendered sheets bake those outlines in; do not ship F-042 before the ack lands.
3. `psrw ship` from the feature worktree (Gate 1 runs there; merge into release/1.8).

## Self-review notes (per writing-plans)

- Spec coverage: §2 deliverables → Tasks 6–8; §3 architecture → Tasks 2–6; §4 verification layers (a)(b)(c) → Tasks 1–4 / 4+6 / 8; §5 raster policy → Task 5; §6 sequencing → Ship checklist; §7 out-of-scope respected (no region sheets, no viewer, mirrors untouched, no `content/maps/` edits).
- Type consistency: `drawBasinSheet({doc}) → {svg, notes, problems}` used identically in Tasks 3, 4, 8; `SHEETS[id].build({repoRoot}) → {svg, …, problems}` in Tasks 4, 6, 8; `rasterize({svgPath, pngPath, width, background})` in Tasks 5–7.
- Known judgment call: Task 6 pins town-dot count to 7 (current town-tier census). If a town is added later the test fails loudly — intended, it re-pins with the census.
