// Plan E Task 8 — the continent zoom tier. Spec §7.4 gives it maxLabelRank 8
// and ruling 8 (STATE §28) counts thirteen of them in the sheet roster. This
// suite is the proof that all thirteen exist, that each is indexed, that the
// densest one renders the real world at real density with zero PROBLEMS, and
// — the half a green suite usually lacks — that every gate this builder wires
// can still FIRE. Each firing case is driven through an injected content root,
// because the committed data is correct by construction and a gate never
// handed anything wrong cannot be shown to work.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTINENT_SHEETS,
  CONTINENT_MAX_LABEL_RANK,
  buildContinentSheet,
  dominantBiome,
} from "../lib/continent-sheet.mjs";
import { SHEETS } from "../render-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const CONTENT = join(ROOT, "content");
const idx = () => JSON.parse(readFileSync(join(ROOT, "tools/asset-storybook/maps-index.json"), "utf8"));
const budgets = () => JSON.parse(readFileSync(join(CONTENT, "world/budgets.json"), "utf8"));
const resolvedDoc = (nn) => JSON.parse(readFileSync(join(CONTENT, `world/resolved/continent-${nn}.json`), "utf8"));
const fabricDoc = (nn) => JSON.parse(readFileSync(join(CONTENT, `world/fabric/continent-${nn}.json`), "utf8"));

/**
 * A content root carrying ONE continent, so a deliberately broken doc can be
 * pushed through the real builder. Everything not named by the caller is the
 * committed article, so the fixture differs from production in exactly the
 * mutation under test.
 */
function fixtureRoot({ nn = "02", resolved = null, fabric = null }) {
  const dir = mkdtempSync(join(tmpdir(), "continent-sheet-"));
  mkdirSync(join(dir, "world/resolved"), { recursive: true });
  mkdirSync(join(dir, "world/fabric"), { recursive: true });
  mkdirSync(join(dir, "world/lexicon"), { recursive: true });
  writeFileSync(join(dir, `world/resolved/continent-${nn}.json`), JSON.stringify(resolved ?? resolvedDoc(nn)));
  writeFileSync(join(dir, `world/fabric/continent-${nn}.json`), JSON.stringify(fabric ?? fabricDoc(nn)));
  writeFileSync(join(dir, "world/lexicon/landforms.json"), readFileSync(join(CONTENT, "world/lexicon/landforms.json")));
  writeFileSync(join(dir, "world/budgets.json"), readFileSync(join(CONTENT, "world/budgets.json")));
  return dir;
}
const buildIn = (contentRoot, nn = "02", extra = {}) =>
  buildContinentSheet({ repoRoot: ROOT, continent: `c${nn}`, contentRoot, ...extra });

test("thirteen continent sheets, one per landmass, ids unique and non-colliding", () => {
  assert.equal(CONTINENT_SHEETS.length, 13);
  assert.deepEqual(
    [...new Set(CONTINENT_SHEETS.map((s) => s.continent))].sort(),
    ["c01", "c02", "c03", "c04", "c05", "c06", "c07", "c08", "c09", "c10", "c11", "c12", "c13"],
  );
  assert.equal(new Set(CONTINENT_SHEETS.map((s) => s.id)).size, 13, "two sheets share an id");
  for (const s of CONTINENT_SHEETS) {
    assert.match(s.id, /^[a-z][a-z-]*$/, `${s.id} is not a slug`);
    assert.ok(
      !["atlas", "cluster1", "synthetic", "fabric", "overlay"].includes(s.id),
      `${s.id} collides with a sheet another plan registered`,
    );
    assert.equal(typeof s.title, "string");
    assert.ok(s.title.includes(" — "), `${s.id}: a bare name on a storybook card teaches nothing`);
  }
});

test("every continent sheet is registered at the continent zoom tier", () => {
  assert.equal(CONTINENT_MAX_LABEL_RANK, 8, "spec §7.4 fixes the continent tier at 8");
  for (const s of CONTINENT_SHEETS) {
    const entry = SHEETS[s.id];
    assert.ok(entry, `${s.id} is not in SHEETS — render-sheet.mjs was not wired`);
    assert.equal(entry.maxLabelRank, CONTINENT_MAX_LABEL_RANK, `${s.id}: the continent tier is 8`);
    assert.equal(entry.outSvg, `game-client/assets/art/maps/${s.id}.svg`);
    assert.equal(entry.outPng, `game-client/assets/art/maps/${s.id}.png`);
    assert.equal(typeof entry.build, "function");
  }
});

// RULING 8's ARITHMETIC, and the plan's literal corrected by it. The plan drafted
// this test at 18 = "1 atlas + 1 basin + 13 continent + 1 overlay + 1 fabric + 1
// synthetic". Ruling 8 (STATE §28, owner-approved 2026-08-26) retired the basin
// sheet as a SEPARATE entry: its ground is Wealdmarch, which is one of the
// thirteen, so the roster is 4 + 13 = 17 and 18 stays as the ceiling with one
// row of headroom. Both numbers are asserted, because a roster that grew to the
// ceiling would otherwise pass this silently.
test("the roster closes at 17 — 4 standing sheets + 13 continents, inside a ceiling of 18", () => {
  assert.equal(Object.keys(SHEETS).length, 17);
  assert.equal(budgets().sheets.maxSheets, 18);
  assert.ok(Object.keys(SHEETS).length <= budgets().sheets.maxSheets);
  assert.ok(SHEETS.cluster1 === undefined, "the basin sheet came back as a separate entry — ruling 8 says it is wealdmarch");
});

test("X8 parity: every continent sheet has a storybook row, both directions", () => {
  const rows = new Map(idx().sheets.map((r) => [r.id, r]));
  for (const s of CONTINENT_SHEETS) {
    const row = rows.get(s.id);
    assert.ok(row, `${s.id} has no maps-index.json row — maps-index.test.mjs reds Gate 1`);
    assert.equal(row.svg, SHEETS[s.id].outSvg);
    assert.equal(row.png, SHEETS[s.id].outPng);
    assert.equal(row.title, SHEETS[s.id].title);
    assert.ok(row.note.length >= 40, `${s.id}: a note nobody can read is not a review surface`);
  }
  assert.equal(idx().sheets.length, 17);
  for (const row of idx().sheets) assert.ok(SHEETS[row.id], `maps-index row "${row.id}" has no SHEETS entry`);
});

test("ACCEPTANCE: the densest continent builds with ZERO problems", () => {
  const { svg, notes, problems } = buildContinentSheet({ repoRoot: ROOT, continent: "c02" });
  assert.deepEqual(problems, [], problems.join("\n"));
  assert.ok(svg.startsWith("<svg "), "not an svg");
  assert.ok(notes.some((n) => /regions 30 /.test(n)), notes.join(" | "));
  assert.ok(notes.some((n) => /dropped 0/.test(n)), `a label was dropped: ${notes.join(" | ")}`);
});

test("all thirteen build, and none of them throws", () => {
  for (const s of CONTINENT_SHEETS) {
    const out = buildContinentSheet({ repoRoot: ROOT, continent: s.continent });
    assert.deepEqual(out.problems, [], `${s.id}: ${out.problems.join("\n")}`);
    assert.ok(out.svg.length > 0, `${s.id}: empty svg`);
  }
});

test("the continent tier draws NO label above rank 8, and every drawn label has a REAL rank", () => {
  for (const s of CONTINENT_SHEETS) {
    const { svg } = buildContinentSheet({ repoRoot: ROOT, continent: s.continent });
    const ranks = [...svg.matchAll(/<text class="lbl" data-rank="([^"]*)"/g)].map((m) => m[1]);
    assert.ok(ranks.length > 0, `${s.id}: no ranked labels emitted`);
    // A data-rank of "undefined" means an id diverged between the label list
    // and the placer — at which point the tier assertion below is reading
    // nothing at all, which is worse than a wrong number.
    assert.equal(
      ranks.filter((r) => !/^\d+$/.test(r)).length,
      0,
      `${s.id}: a placed label resolved to no rank (${ranks.filter((r) => !/^\d+$/.test(r)).join(", ")})`,
    );
    const worst = Math.max(...ranks.map(Number));
    assert.ok(worst <= CONTINENT_MAX_LABEL_RANK, `${s.id}: rank ${worst} escaped the tier cap`);
  }
});

test("buildContinentSheet is deterministic — same bytes twice", () => {
  assert.equal(
    buildContinentSheet({ repoRoot: ROOT, continent: "c04" }).svg,
    buildContinentSheet({ repoRoot: ROOT, continent: "c04" }).svg,
  );
});

test("every committed continent SVG is current", () => {
  for (const s of CONTINENT_SHEETS) {
    const p = join(ROOT, SHEETS[s.id].outSvg);
    assert.ok(existsSync(p), `${p} was never rendered`);
    assert.equal(
      readFileSync(p, "utf8"),
      buildContinentSheet({ repoRoot: ROOT, continent: s.continent }).svg,
      `stale: node tools/mapforge/render-sheet.mjs --sheet ${s.id}`,
    );
  }
});

test("every continent sheet stays inside the committed byte budget", () => {
  const cap = budgets().sheets.maxSvgBytes;
  for (const s of CONTINENT_SHEETS) {
    const bytes = Buffer.byteLength(buildContinentSheet({ repoRoot: ROOT, continent: s.continent }).svg, "utf8");
    assert.ok(bytes <= cap, `${s.id}: ${bytes} > ${cap}`);
  }
});

// The frame answers the question a square canvas would have dodged: does the
// small chain get DRAWN, or merely placed tiny in a huge sheet? The map area
// follows the landmass's own aspect plus a neatline margin, so the drawn
// extent is a large majority of the map area on every sheet including the
// smallest. Measured floor, not an aspiration.
test("the scale rule is honest: the drawn extent fills its map area on every sheet, smallest included", () => {
  for (const s of CONTINENT_SHEETS) {
    const { notes } = buildContinentSheet({ repoRoot: ROOT, continent: s.continent });
    const frame = /frame (\d+)x(\d+) px/.exec(notes.join("\n"));
    const scale = /scale ([\d.]+) px\/km over ([\d.]+) x ([\d.]+) km/.exec(notes.join("\n"));
    assert.ok(frame && scale, `${s.id}: the frame/scale notes did not parse`);
    const [fw, fh] = [Number(frame[1]), Number(frame[2])];
    const [ppk, sx, sy] = [Number(scale[1]), Number(scale[2]), Number(scale[3])];
    const fill = ((sx * ppk) / fw) * ((sy * ppk) / fh);
    assert.ok(fill >= 0.6, `${s.id}: the drawn extent is only ${(fill * 100).toFixed(1)}% of its map area`);
    assert.ok(ppk <= 24, `${s.id}: ${ppk} px/km — a 12 km chain must not be drawn at 100 px/km`);
  }
});

// RULING 8, DISCHARGED. The retired basin sheet's five subject keys come back
// here, drawn from the resolved doc rather than from the dead spine descriptor.
// Four of them are asserted as DRAWN; the fifth is asserted as ABSENT FROM THE
// DATA, which is the honest statement — `iceEdge` is null on all thirteen
// resolved continents (STATE §28 filed-not-fixed 1, which named Task 8 as where
// it would bite). The path that draws one is proven separately below, so the
// day the resolved writer emits an ice edge this test reds and a human decides.
test("RULING 8: the basin's subject keys are drawn on wealdmarch, from the resolved doc", () => {
  const doc = resolvedDoc("02");
  const { svg, notes } = buildContinentSheet({ repoRoot: ROOT, continent: "c02" });
  assert.ok(doc.coastline && doc.river && doc.saltmire && doc.terrainPatches.length > 0);
  assert.ok(/stroke-width="1.6"/.test(svg), "the coast is not drawn");
  assert.ok(svg.includes(`stroke="#3a6b7a"`) || /stroke-width="2.2"/.test(svg), "the river is not drawn");
  assert.ok(/url\(#pMire\)/.test(svg), "the saltmire is not drawn");
  assert.ok(/fill-opacity="0.6"/.test(svg), "no terrain patch is drawn");
  assert.equal(doc.iceEdge, null, "an ice edge appeared in the resolved doc — decide what the sheet should say about it");
  assert.ok(
    notes.some((n) => /iceEdge none in the resolved doc/.test(n)),
    "the sheet must SAY the ice edge is absent rather than pass over it in silence",
  );
});

test("the iceEdge draw path works — it is dormant because the DATA is null, not because the code is dead", () => {
  const doc = resolvedDoc("02");
  const bare = buildContinentSheet({ repoRoot: ROOT, continent: "c02" });
  const dir = fixtureRoot({
    resolved: { ...doc, iceEdge: { id: "f-ice-test", points: doc.coastline.points.slice(0, 12) } },
  });
  const out = buildIn(dir);
  assert.deepEqual(out.problems, [], out.problems.join("\n"));
  assert.ok(/stroke-dasharray="6 4"/.test(out.svg), "the ice edge did not draw");
  assert.ok(!/stroke-dasharray="6 4"/.test(bare.svg), "the committed sheet already draws one — this control is dead");
  assert.ok(out.notes.some((n) => /iceEdge yes/.test(n)));
});

// ── THE GATES FIRE ────────────────────────────────────────────────────────
// Each case below was watched RED with the mutation in place and GREEN without
// it. A builder whose gates cannot be shown to fire is a builder with no gates.

test("a missing resolved file is a diagnosable PROBLEM, never a throw", () => {
  const out = buildContinentSheet({ repoRoot: ROOT, continent: "c99" });
  assert.equal(out.svg, "");
  assert.match(out.problems.join("\n"), /continent-99\.json/);
});

test("G-BIOME-INK fires: at a tier that hides a fill the sheet actually paints", () => {
  const clean = buildContinentSheet({ repoRoot: ROOT, continent: "c02" });
  assert.deepEqual(clean.problems, []);
  const hidden = buildContinentSheet({ repoRoot: ROOT, continent: "c02", legendTier: 1 });
  assert.ok(hidden.problems.length > 0, "tier 1 hides most of the legend and the gate said nothing");
  assert.equal(hidden.svg, "", "a sheet with problems must not produce bytes");
  // NAMED, not counted. The three frontier hatches are the half that moved
  // into the baked <image>, where no markup scan can see them — they only
  // reach the gate because the referenced set reads each baked region's own
  // tile id. A bare `problems.length > 0` passed with that reading removed
  // and half the gate silently dark, which is how coverage is lost.
  for (const p of ["pReportedSworn", "pReportedHearsay", "pReportedInferred"])
    assert.ok(
      hidden.problems.some((x) => x.includes(p) && x.includes("no visible legend row")),
      `${p} is painted by the bake but G-BIOME-INK cannot see it: ${hidden.problems.join(" | ")}`,
    );
});

test("G-GLYPH fires: a landform whose glyph family does not exist would draw NOTHING", () => {
  const doc = resolvedDoc("02");
  const landmarks = doc.landmarks.map((l, i) => (i === 0 && l.at ? { ...l, glyph: "g-does-not-exist" } : l));
  assert.ok(landmarks.some((l) => l.glyph === "g-does-not-exist"), "the mutation did not apply");
  const out = buildIn(fixtureRoot({ resolved: { ...doc, landmarks } }));
  assert.match(out.problems.join("\n"), /no <symbol id="g-does-not-exist"> was emitted/);
});

test("the terrain-kind fill REPORTS instead of falling back to headland rock", () => {
  const doc = resolvedDoc("02");
  const terrainPatches = doc.terrainPatches.map((t, i) => (i === 0 ? { ...t, terrainKind: "nowhere-land" } : t));
  const out = buildIn(fixtureRoot({ resolved: { ...doc, terrainPatches } }));
  assert.match(out.problems.join("\n"), /kind "nowhere-land" with no FILL_FOR entry/);
});

test("a surveyed region the fabric cannot give a biome for REPORTS rather than baking as parchment", () => {
  const doc = resolvedDoc("02");
  const fab = fabricDoc("02");
  const first = doc.zones.find((z) => z.survey === "surveyed");
  const regions = fab.regions.map((r) => (r.id === first.id ? { ...r, biomeShares: {} } : r));
  const out = buildIn(fixtureRoot({ resolved: doc, fabric: { ...fab, regions } }));
  assert.match(out.problems.join("\n"), new RegExp(`surveyed region "${first.id.replace("/", "\\/")}" has no dominant biome`));
});

test("a resolved doc whose array keys are not arrays REPORTS each key by name", () => {
  const doc = resolvedDoc("02");
  const out = buildIn(fixtureRoot({ resolved: { ...doc, zones: null, landmarks: "nope", dungeons: 7 } }));
  for (const k of ["zones", "landmarks", "dungeons"])
    assert.match(out.problems.join("\n"), new RegExp(`resolved key "${k}" is not an array`));
});

test("NEVER THROWS: every degenerate resolved doc the reviewer could construct", () => {
  const doc = resolvedDoc("02");
  const cases = {
    "empty zones": { ...doc, zones: [] },
    "a two-point polygon": {
      ...doc,
      zones: doc.zones.map((z, i) => (i === 0 ? { ...z, polygon: [[1, 1], [2, 2]] } : z)),
    },
    "a null labelAt": { ...doc, zones: doc.zones.map((z) => ({ ...z, labelAt: null })) },
    "a landmark with no glyph and no at": {
      ...doc,
      landmarks: doc.landmarks.map((l) => ({ ...l, glyph: null, at: null })),
    },
    "a null coastline": { ...doc, coastline: null },
    "NaN in a ring": {
      ...doc,
      zones: doc.zones.map((z, i) => (i === 0 ? { ...z, polygon: [[NaN, 1], [2, 2], [3, 3], [4, 4]] } : z)),
    },
    "no river, mire, patches or towns": { ...doc, river: null, saltmire: null, terrainPatches: [], towns: [] },
  };
  for (const [name, resolved] of Object.entries(cases)) {
    const out = buildIn(fixtureRoot({ resolved }));
    assert.ok(Array.isArray(out.problems), `${name}: no problems array came back`);
    assert.equal(typeof out.svg, "string", `${name}: svg is not a string`);
    if (out.problems.length) assert.equal(out.svg, "", `${name}: a red sheet produced bytes`);
    assert.ok(
      !out.problems.some((p) => /unexpected throw/.test(p)),
      `${name}: ${out.problems.filter((p) => /unexpected throw/.test(p)).join("; ")}`,
    );
  }
});

test("the never-throw contract holds for a degenerate ARGUMENT too, not just a degenerate document", () => {
  // join() throws on a non-string path before any file is read, which is the
  // one input that gets past every in-band guard. Without the outer catch this
  // is a CLI crash that takes the caller's finish() — and every problem
  // recorded before it — with it.
  const out = buildContinentSheet({ repoRoot: ROOT, continent: "c02", contentRoot: 5 });
  assert.equal(out.svg, "");
  assert.match(out.problems.join("\n"), /unexpected throw/);
});

test("dominantBiome is total — ties break by name and degenerate input answers null", () => {
  assert.equal(dominantBiome({ meadow: 60, forest: 40 }), "meadow");
  assert.equal(dominantBiome({ forest: 50, meadow: 50 }), "forest", "ties must break by name, or the bake is not deterministic");
  for (const bad of [null, undefined, [], "x", 3, {}]) assert.equal(dominantBiome(bad), null, JSON.stringify(bad));
});

// Reviewer question (e), answered by measurement rather than by inspection: the
// `?? "pReported"` fallback exists for a provenance the fabric never wrote, and
// a fallback that silently swallows a whole world is indistinguishable from one
// that never fires. Today it never fires — and this test is what says so if
// that ever changes.
test("no reported region takes the generic hatch fallback — every one carries a real provenance", () => {
  let fallbacks = 0;
  for (const s of CONTINENT_SHEETS) {
    const { notes } = buildContinentSheet({ repoRoot: ROOT, continent: s.continent });
    const m = /hatch fallback (\d+)/.exec(notes.join("\n"));
    assert.ok(m, `${s.id}: the hatch-fallback note is missing`);
    fallbacks += Number(m[1]);
  }
  assert.equal(fallbacks, 0, `${fallbacks} reported regions fell back to the generic hatch`);
});

// The reported hatch is BAKED, not drawn as a live <pattern> fill — measured at
// 72-78% of a sheet's raster cost when it was live, which put three continents
// over budgets.json's 2 s maxRasterSeconds. This pins the mechanism so a future
// "simplification" back to a live fill shows up as a red rather than as a
// Gate-2 timing flake.
test("the reported hatch is in the baked underlay, not in a live pattern fill", () => {
  const { svg } = buildContinentSheet({ repoRoot: ROOT, continent: "c07" });
  // <path>, not <rect>: the legend swatches are rects and MUST still reference
  // these patterns — that is the reader's key. What may not come back is a
  // region-shaped path painted with a live hatch.
  const liveHatch = [...svg.matchAll(/<path [^>]*fill="url\(#(pReported[^)]*)\)"/g)].map((m) => m[1]);
  assert.deepEqual(liveHatch, [], `${liveHatch.length} live reported-hatch fills — the raster budget breaks at 2000 px`);
  assert.ok(/<rect [^>]*fill="url\(#pReportedHearsay\)"/.test(svg), "the legend swatch went with it — the reader has no key");
  assert.ok(/<image href="data:image\/png;base64,/.test(svg), "there is no baked underlay at all");
});
