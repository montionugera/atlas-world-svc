// tools/mapforge/tests/fabric-sheet.test.mjs — Plan C Task 13's two review
// sheets, and the retirements that land with them.
//
// The owner rule these exist for (2026-08-15): a produced artifact that cannot
// be VIEWED in a review surface is not delivered. Plan C produces 14 fabric
// files and 13 handle ledgers; the `fabric` sheet is their shape and the
// `overlay` sheet is their difference from the world the trunk still describes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHEETS } from "../render-sheet.mjs";
import { buildFabricSheet } from "../lib/fabric-sheet.mjs";
import { buildOverlaySheet, baselineDirFor, shoelace } from "../lib/overlay-sheet.mjs";
import { sourceFilesUnder, codeOfFile } from "./_source-scan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

test("SHEETS registers fabric and overlay with the grown entry shape", () => {
  for (const id of ["fabric", "overlay"]) {
    const s = SHEETS[id];
    assert.ok(s, `SHEETS has no "${id}" entry`);
    assert.equal(typeof s.title, "string");
    assert.ok(s.title.length > 0);
    assert.equal(typeof s.maxLabelRank, "number");
    assert.match(s.outSvg, /^game-client\/assets\/art\/maps\/.*\.svg$/);
    assert.match(s.outPng, /^game-client\/assets\/art\/maps\/.*\.png$/);
    assert.equal(typeof s.build, "function");
  }
});

test("the fabric sheet draws all 13 landmasses and reports no problems", () => {
  const { svg, problems, notes } = buildFabricSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, [], problems.join("; "));
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>\s*$/);
  for (let n = 1; n <= 13; n++) {
    const c = `c${String(n).padStart(2, "0")}`;
    assert.ok(svg.includes(`>${c}<`), `no label for ${c}`);
  }
  assert.ok(notes.some((n) => /13 landmasses/.test(n)), notes.join("; "));
  assert.ok(notes.some((n) => /160 regions \(40 surveyed\), 47 settlements/.test(n)), notes.join("; "));
  assert.ok(notes.some((n) => /sea\/land 1\.5 on 64000 km²/.test(n)), notes.join("; "));
});

test("the fabric sheet draws the COASTLINE, not the trunk's simplified ring", () => {
  // STATE §17: the trunk vertex cap tightens c06 Reedstrand's placement to 16
  // points against a 154-point one-shot coast, and Plan E must ink
  // `fabric.outerRing`, never `placement.points`. The sheet is the first
  // consumer that could get this wrong, so the property is measured rather
  // than commented: every emitted outer ring's vertices appear in the svg.
  const { svg } = buildFabricSheet({ repoRoot: ROOT });
  const world = readJson("content/world/fabric/world.json");
  let vertices = 0;
  for (const c of world.continents) vertices += readJson(c.fabric).outerRing.length;
  assert.equal(vertices, 2413, "the emitted coastline vertex count moved");
  const drawn = (svg.match(/[ML]\d/g) ?? []).length;
  assert.ok(drawn > vertices, `only ${drawn} path vertices drawn for a ${vertices}-vertex coastline`);
});

test("the fabric sheet draws the survey gradient VISIBLY, not as four levels of one channel", () => {
  // spec §6.4 rule 2's honest-frontier gradient. parchmentDeep against
  // parchment is a 4-level difference in one channel and reads as nothing at
  // 512 px, so the STROKE carries it — asserted here because the comment in
  // the builder claims the gradient is drawn.
  const { svg } = buildFabricSheet({ repoRoot: ROOT });
  const surveyedStroke = (svg.match(/stroke-width="0\.7"/g) ?? []).length;
  const reportedStroke = (svg.match(/stroke-width="0\.3"/g) ?? []).length;
  assert.equal(surveyedStroke, 40, "the 40 surveyed regions are not drawn at the surveyed weight");
  assert.equal(reportedStroke, 120, "the 120 reported regions are not drawn at the reported weight");
});

test("the fabric sheet is drawn from the COMMITTED fabric, not from the spine", () => {
  const src = readFileSync(join(ROOT, "tools/mapforge/lib/fabric-sheet.mjs"), "utf8");
  assert.ok(!/loadSpine|buildTree/.test(src),
    "the fabric sheet reads the spine — it must read content/world/fabric/ so the two layers can be compared");
  assert.match(src, /content\/world\/fabric/);
});

test("the overlay sheet reads the baseline from the DRAFT folder, never from git", () => {
  const src = readFileSync(join(ROOT, "tools/mapforge/lib/overlay-sheet.mjs"), "utf8");
  assert.ok(!/execFileSync|child_process|spawnSync/.test(src),
    "the overlay sheet shells out — it must read baseline/ from the draft folder so it works in a dirty worktree");
  // And the PREFERENCE is driven, not asserted from the source: inside a draft
  // root `content/spine/nodes` is already the GENERATED trunk, so an overlay
  // that read it would draw the new world under the new world and show
  // nothing at all.
  const d = mkdtempSync(join(tmpdir(), "overlay-base-"));
  try {
    mkdirSync(join(d, "content/spine/nodes"), { recursive: true });
    assert.equal(baselineDirFor({ repoRoot: d }), join(d, "content/spine/nodes"));
    mkdirSync(join(d, "baseline/spine/nodes"), { recursive: true });
    assert.equal(baselineDirFor({ repoRoot: d }), join(d, "baseline/spine/nodes"),
      "a draft root's own baseline/ must win over its generated content/spine/nodes");
    assert.equal(baselineDirFor({ repoRoot: d, baselineDir: "/x" }), "/x");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("the overlay sheet carries a per-continent area-delta table with BOTH sides", () => {
  const { svg, problems, notes } = buildOverlaySheet({ repoRoot: ROOT });
  assert.deepEqual(problems, [], problems.join("; "));
  assert.match(svg, /area delta/i);
  assert.ok((svg.match(/<text/g) ?? []).length >= 14, "no per-continent delta rows");
  // The join that makes it a comparison rather than a list: a continent's
  // baseline polygon is found through manifest.landmasses[].nodeId. Seven of
  // the thirteen have one; six are NEW.
  assert.match(svg, /c02 {2}1040\.7 {2}-&gt; {2}12102\.8 km² {3}x11\.63/,
    "c02 is n-cluster1, the one landmass whose node id survives the redraw, so its row is the join " +
    "working end to end: the committed polygon on the left, the generated gross land on the right");
  assert.equal((svg.match(/NEW<\/text>/g) ?? []).length, 6,
    "six of the thirteen landmasses have no committed polygon at all");
  assert.match(svg, /TOTAL 6243\.5 {2}-&gt; {2}65600\.0 km² {3}x10\.51/);
  assert.ok(notes.some((n) => /gross land 6243\.5 -> 65600\.0 km²/.test(n)), notes.join("; "));
});

test("the overlay's baseline total is the 6,243.5 km² every other document quotes", () => {
  // Measured off the committed trunk, so the sheet and STATE cannot drift.
  const dir = join(ROOT, "content/spine/nodes");
  let total = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const n = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (n.tier === "continent" && n.placement?.shape === "polygon") total += shoelace(n.placement.points);
  }
  assert.equal(Number(total.toFixed(1)), 6243.5);
});

test("the sea:land ratio the REVIEW SURFACES publish is the one the gate measures", () => {
  // CITATION ROT, fifth occurrence in this repo. tools/asset-storybook/maps-index.json
  // and game-client/assets/art/art-manifest.json both published a hand-typed
  // "24.68 : 1" while `G-SEALAND` on the same tree printed "trunk 24.63 : 1" —
  // and scripts/lib/world.mjs carried BOTH figures eleven lines apart. The
  // land area 6,243.5 was pinned by the test above; the ratio derived from it
  // was joined to nothing, which is precisely how the previous four started.
  //
  // So it is DERIVED here, by the gate's own identity
  // (gWorldSeaLandTrunk: (frame - land) / land), from the committed trunk and
  // the committed frame, and both surfaces must quote the result.
  const dir = join(ROOT, "content/spine/nodes");
  let land = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const n = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (n.tier === "continent" && n.placement?.shape === "polygon") land += shoelace(n.placement.points);
  }
  const frame = readJson("content/world/manifest.json").frame.areaKm2;
  const ratio = ((frame - land) / land).toFixed(2);
  assert.equal(ratio, "24.63", "the committed trunk's sea:land ratio moved — re-derive both review surfaces");
  for (const rel of ["tools/asset-storybook/maps-index.json", "game-client/assets/art/art-manifest.json"]) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    const quoted = [...text.matchAll(/sea[- ]to[- ]land ratio going (\d+\.\d+) : 1|sea:land (\d+\.\d+) : 1/g)]
      .map((m) => m[1] ?? m[2]);
    assert.ok(quoted.length > 0, `${rel} no longer quotes a sea:land ratio — the scan has gone dark`);
    assert.deepEqual([...new Set(quoted)], [ratio],
      `${rel} publishes a sea:land ratio the gate does not measure`);
  }
});

test("both sheets are deterministic — the render lock hashes them", () => {
  for (const [id, build] of [["fabric", buildFabricSheet], ["overlay", buildOverlaySheet]]) {
    const a = build({ repoRoot: ROOT }).svg, b = build({ repoRoot: ROOT }).svg;
    assert.equal(a, b, `${id} is not deterministic`);
  }
  const lock = readJson("content/world/render-lock.json").artifacts;
  for (const id of ["fabric", "overlay"])
    assert.ok(lock[SHEETS[id].outSvg], `${SHEETS[id].outSvg} has no render-lock row`);
});

test("the render lock covers the committed fabric and handle files too", () => {
  const lock = readJson("content/world/render-lock.json").artifacts;
  for (const fam of ["content/world/fabric", "content/world/handles"])
    for (const f of readdirSync(join(ROOT, fam)))
      assert.ok(lock[`${fam}/${f}`], `${fam}/${f} is committed but not locked — a hand edit would be silent`);
  assert.equal(Object.keys(lock).length, 5 + 14 + 13);
});

test("both sheets degrade in-band on a root with no fabric — they never throw", () => {
  const d = mkdtempSync(join(tmpdir(), "no-fabric-"));
  try {
    const f = buildFabricSheet({ repoRoot: d });
    assert.equal(f.svg, "");
    assert.ok(f.problems.some((p) => /does not exist/.test(p)), f.problems.join("; "));
    const o = buildOverlaySheet({ repoRoot: d });
    assert.equal(o.svg, "");
    assert.ok(o.problems.length > 0);
    // …and an unreadable file is one clean problem, not a throw.
    mkdirSync(join(d, "content/world/fabric"), { recursive: true });
    writeFileSync(join(d, "content/world/fabric/world.json"), "{ not json");
    const g = buildFabricSheet({ repoRoot: d });
    assert.ok(g.problems.some((p) => /not readable JSON/.test(p)), g.problems.join("; "));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("both sheets stay inside the committed SVG byte budget", () => {
  const budgets = readJson("content/world/budgets.json");
  for (const id of ["fabric", "overlay"]) {
    const bytes = readFileSync(join(ROOT, SHEETS[id].outSvg)).length;
    assert.ok(bytes <= budgets.sheets.maxSvgBytes,
      `${id} sheet is ${bytes} bytes > budget ${budgets.sheets.maxSvgBytes}`);
  }
});

test("the committed fabric is complete: 14 files, 13 ledgers", () => {
  const f = readdirSync(join(ROOT, "content/world/fabric")).sort();
  assert.equal(f.length, 14);
  assert.ok(f.includes("world.json"));
  assert.equal(readdirSync(join(ROOT, "content/world/handles")).length, 13);
});

test("the committed fabric is the one the generator produces from the committed seed", () => {
  // Not a re-generation (that is generate-world.test.mjs's ~7 s job) but the
  // join that makes the committed bytes traceable: every fabric file names the
  // committed seed and generator version, and world.json's continent roster is
  // the manifest's thirteen.
  const world = readJson("content/world/fabric/world.json");
  const manifest = readJson("content/world/manifest.json");
  assert.equal(world.seed, manifest.seed);
  assert.deepEqual(world.continents.map((c) => c.id), manifest.landmasses.map((l) => l.id));
  for (const c of world.continents) {
    const doc = readJson(c.fabric);
    assert.equal(doc.generator.seed, world.seed, `${c.id} was generated from a different seed`);
    assert.equal(doc.generator.version, world.generator.version);
  }
});

test("the retired generator and its tests are gone", () => {
  for (const p of ["tools/mapforge/gen-world.mjs", "tools/mapforge/lib/world-gen.mjs",
                   "tools/mapforge/tests/gen-world.test.mjs", "tools/mapforge/tests/world-gen.test.mjs"])
    assert.equal(existsSync(join(ROOT, p)), false, `${p} survived`);
});

test("the retired hardcodes appear in no CODE anywhere under tools/ or scripts/", () => {
  // Acceptance criterion 13 says the three names appear "nowhere in the repo".
  // Taken as a raw string scan that is UNSATISFIABLE and undesirable: they are
  // named in generate-world.mjs's header, which explains what they were and
  // why they are gone (and generate-world.test.mjs asserts that explanation
  // survives), in the plan document, in STATE and in the backlog spec.
  // Deleting the explanation would make the tree worse. The satisfiable and
  // useful reading is CODE: comments stripped, over every scanned file rather
  // than the one CLI the seam-6 test looked at.
  // PRODUCTION source only — `tests/` is excluded on both sides, the same
  // split the determinism ban uses. A test may legitimately NAME a retired
  // constant in a string (generate-world.test.mjs does, asserting it is gone
  // from the CLI); what must not survive is a definition or a read.
  const files = [
    ...sourceFilesUnder(join(ROOT, "tools/mapforge")).filter((f) => !f.startsWith("tests/"))
      .map((f) => join(ROOT, "tools/mapforge", f)),
    ...sourceFilesUnder(join(ROOT, "scripts"))
      .filter((f) => !f.startsWith("node_modules/") && !f.startsWith("tests/"))
      .map((f) => join(ROOT, "scripts", f)),
  ];
  assert.ok(files.length >= 30, `only ${files.length} files scanned — this test cannot go dark`);
  assert.ok(files.some((f) => f.includes("generate-world.mjs")), "the CLI that carries the prose was not scanned");
  // The needles are ASSEMBLED rather than written, because this file is inside
  // the set it scans and a literal here is a hit on itself. (Measured: the
  // first version of this test failed naming its own path.)
  const needles = ["SYNTHETIC" + "_LOAD_BUDGET", "PRE_WORLD" + "_ATLAS_CHILDREN", "PRE_WORLD" + "_SEALANE_ID"];
  assert.ok(codeOfFile(join(ROOT, "tools/mapforge/generate-world.mjs")).includes("writeRun"),
    "the comment stripper ate the source — the scan below would pass on nothing");
  for (const f of files)
    for (const bad of needles)
      assert.ok(!codeOfFile(f).includes(bad), `${bad} survives in ${f}`);
  // …and the PROSE that explains the retirement is still there, in the one
  // file whose header is the explanation. Criterion 13's literal reading would
  // delete this.
  assert.ok(readFileSync(join(ROOT, "tools/mapforge/generate-world.mjs"), "utf8")
    .includes(needles[1]), "the header no longer explains what the three hardcodes were");
});

test("the retired content/spine/candidates/ ignore rule is gone, and there was never a directory", () => {
  const gi = readFileSync(join(ROOT, ".gitignore"), "utf8");
  assert.ok(!gi.includes("content/spine/candidates"),
    "the candidates ignore rule survived — the CONCEPT is retired, and the directory never existed on disk");
  assert.equal(existsSync(join(ROOT, "content/spine/candidates")), false);
  // The rule it was restored beside must NOT go with it: build/mapforge/ is
  // where every draft run lands and the migration invariant depends on it.
  assert.match(gi, /^build\/mapforge\/$/m);
});
