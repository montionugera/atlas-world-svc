// scripts/lib/world.mjs — Plan C: the ONE pure library for content/world/.
//
// Same contract as scripts/lib/spine.mjs, for the same reasons:
//   - one options object per function, no positional overloads;
//   - functions NEVER throw on bad content — errors return in-band, because
//     an uncaught throw in check_content.mjs skips finish() and silently
//     drops every FAIL recorded before it;
//   - SOFT SKIP: a content root with no world/ returns present:false and NO
//     errors. ~45 existing gate fixtures have no world/ directory and a
//     hard-fail here would red every one of them.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

// `!doc` and `doc === null` CANNOT distinguish "the read failed" from "the
// file parsed to a JSON-falsy value" — and a file whose whole content is the
// four bytes `null` is the second. Treating them alike is how a broken record
// becomes a silent skip; check_content.mjs's own loaders (loadMobTypes,
// loadBestiaryDesigns) solve it by comparing the failure COUNT before and
// after, and this is the same discipline. Reproduced by review fixtures, 2026-08-22.
const readJsonInBand = (path, label, errors) => {
  const before = errors.length;
  let doc = null;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    errors.push(`${label}: cannot read: ${e.message}`);
  }
  return { doc, ok: errors.length === before };
};

// readdirSync itself throws on an unreadable directory — a permissions bit, a
// dangling symlink, or a FILE where a directory is expected (ENOTDIR, which is
// how the fixtures reproduce it portably). listJson is called from loadFabric,
// which contracts never to throw, so the guard is here and not at each call
// site. The wording matches walkJson's below: one grammar for one condition.
function listJson(dir, label, errors) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch (e) {
    errors.push(`${label} cannot be listed: ${e.message}`);
    return [];
  }
}

// One shape rule for both families: a record file must be a JSON OBJECT. An
// array, a bare number, a string or a literal `null` would spread into nothing
// and arrive at the gates as an empty record carrying only its `file` key —
// a silent skip dressed up as data.
function readRecord(path, label, errors) {
  const { doc, ok } = readJsonInBand(path, label, errors);
  if (!ok) return null;                        // the read already recorded its own failure
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    errors.push(`${label}: is not a JSON object`);
    return null;
  }
  return doc;
}

export function loadFabric({ contentRoot }) {
  const errors = [];
  const dir = join(contentRoot, "world");
  const empty = { present: false, manifest: undefined, budgets: undefined, fabric: [], world: null, handles: [], premises: [], errors };
  if (!existsSync(dir)) return empty;

  // ABSENT and MALFORMED are different facts and the caller acts on each
  // differently, so they get different values: `undefined` means the file is
  // not there, `null` means it is there and did not parse to a JSON object
  // (readRecord has already recorded that in-band). Collapsing them is how
  // G-WORLD-BUDGET came to report `budgets.json is missing` about a file that
  // was right there, beside loadFabric's correct message — two failures for one
  // defect, one of them sending the reader after the wrong thing.
  const manifest = existsSync(join(dir, "manifest.json"))
    ? readRecord(join(dir, "manifest.json"), "world/manifest.json", errors)
    : undefined;
  const budgets = existsSync(join(dir, "budgets.json"))
    ? readRecord(join(dir, "budgets.json"), "world/budgets.json", errors)
    : undefined;

  const fabricDir = join(dir, "fabric");
  const fabric = [];
  let world = null;
  for (const f of listJson(fabricDir, "world/fabric", errors)) {
    const doc = readRecord(join(fabricDir, f), `world/fabric/${f}`, errors);
    if (doc === null) continue;
    if (f === "world.json") world = { file: f, ...doc };
    else fabric.push({ file: f, ...doc });
  }

  const handleDir = join(dir, "handles");
  const handles = [];
  for (const f of listJson(handleDir, "world/handles", errors)) {
    const doc = readRecord(join(handleDir, f), `world/handles/${f}`, errors);
    if (doc !== null) handles.push({ file: f, ...doc });
  }

  // THE PREMISES ARE LOADED HERE SO THEY CAN HAVE AN AJV VENUE (STATE §10's
  // open item, handed to Task 11). Until now content/schemas/premise.schema.json
  // was compiled by nothing: mask.test.mjs held the join in both directions,
  // which is a TEST of the committed thirteen and not a gate on a content root.
  // A draft or fixture root could carry a fourteenth premise, or a premise with
  // a mistyped `register`, and no gate would say so.
  const premiseDir = join(dir, "premises");
  const premises = [];
  for (const f of listJson(premiseDir, "world/premises", errors)) {
    const doc = readRecord(join(premiseDir, f), `world/premises/${f}`, errors);
    if (doc !== null) premises.push({ file: f, ...doc });
  }

  return { present: true, manifest, budgets, fabric, world, handles, premises, errors };
}

// Walk a family directory for .json files. Returns [] for an absent directory
// (an unbuilt family is not a failure) and records an in-band error for one it
// cannot read, rather than throwing out of the gate.
function walkJson(dir, rel, report) {
  const out = [];
  const walk = (d, relD) => {
    if (!existsSync(d)) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch (e) {
      report(`G-WORLD-BUDGET: ${relD} cannot be listed: ${e.message}`);
      return;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (e.isDirectory()) walk(join(d, e.name), `${relD}/${e.name}`);
      else if (e.name.endsWith(".json")) out.push({ abs: join(d, e.name), rel: `${relD}/${e.name}` });
    }
  };
  walk(dir, rel);
  out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return out;
}

// G-WORLD-BUDGET — PRINTS its measurements on every run, exactly as
// G-LOAD-BUDGET (check_content.mjs) and G-COMP-REPORT do, so drift is
// visible before it is a failure. `note` is the print sink; `report` is fail.
//
// This gate owns content/world/budgets.json's EXISTENCE check as well as the
// `fabric` / `civil` families, the `cellKm` pin and the `loop` table. Plan B's
// gSpineWorld deliberately returns quietly when the file is gone so exactly
// one gate speaks.
export function gWorldBudget({ contentRoot, budgets, manifest = undefined, report, note }) {
  if (budgets === undefined) {
    report(`G-WORLD-BUDGET: world/budgets.json is missing`);
    return;
  }
  // A file that EXISTS and parses to an array or a scalar is not "missing", and
  // saying so beside loadFabric's correct `is not a JSON object` sent a reader
  // looking for a file that is right there (review finding: `budgets.json = []`
  // produced two failures, one of them false).
  if (budgets === null || typeof budgets !== "object" || Array.isArray(budgets)) {
    report(`G-WORLD-BUDGET: world/budgets.json is not a JSON object, so no budget in it can be read`);
    return;
  }
  // The manifest is where every quota this gate reports against lives. Without
  // it the town-plan line below simply does not print — a measurement silently
  // absent rather than a measurement failing, which is the failure mode the
  // print discipline exists to prevent. A world root that carries budgets.json
  // is an authored world root, and an authored world root has a manifest.
  // Reproduced: deleting content/world/manifest.json left `--only=spine` at
  // exit 0, and only the scripts suite (Gate 2 / CI — precheck.sh has no
  // scripts-suite lane) noticed.
  if (manifest === undefined)
    report(`G-WORLD-BUDGET: world/budgets.json is present but world/manifest.json is missing — every manifest-derived quota, including the town-plan line, goes dark rather than red`);
  const section = (name) => {
    const s = budgets[name];
    return s && typeof s === "object" && !Array.isArray(s) ? s : null;
  };
  const families = [
    {
      name: "fabric", dir: join(contentRoot, "world/fabric"), rel: "world/fabric",
      maxFiles: section("fabric")?.maxFiles, maxPer: section("fabric")?.maxBytesPerFile,
      maxTotal: section("fabric")?.maxBytesTotal ?? null,
    },
    {
      name: "civil", dir: join(contentRoot, "world/civil"), rel: "world/civil",
      maxFiles: section("civil")?.maxFiles, maxPer: section("civil")?.maxBytesPerFile,
      maxTotal: null,
    },
    // TWO FAMILIES THAT WERE UNDER NO BYTE BUDGET AT ALL until Task 11 — filed
    // in STATE §10 (premises) and §16 (handles) and handed here. `premises` is
    // 13 authored files of ~600 B; `handles` is 13 machine-written ledgers
    // totalling ~335 KB, which is a third of the fabric family's measured size
    // and was invisible to G-WORLD-BUDGET's only two rows. Both caps are
    // DERIVED, not chosen: see budgets.json's `premisesWhy` / `handlesWhy`.
    {
      name: "premises", dir: join(contentRoot, "world/premises"), rel: "world/premises",
      maxFiles: section("premises")?.maxFiles, maxPer: section("premises")?.maxBytesPerFile,
      maxTotal: section("premises")?.maxBytesTotal ?? null,
    },
    {
      name: "handles", dir: join(contentRoot, "world/handles"), rel: "world/handles",
      maxFiles: section("handles")?.maxFiles, maxPer: section("handles")?.maxBytesPerFile,
      maxTotal: section("handles")?.maxBytesTotal ?? null,
    },
  ];
  for (const fam of families) {
    if (typeof fam.maxFiles !== "number" || typeof fam.maxPer !== "number") {
      report(`G-WORLD-BUDGET: world/budgets.json has no "${fam.name}" section`);
      continue;
    }
    const files = walkJson(fam.dir, fam.rel, report);
    let total = 0;
    for (const f of files) {
      let bytes;
      try {
        bytes = statSync(f.abs).size;
      } catch (e) {
        report(`G-WORLD-BUDGET: ${f.rel} cannot be measured: ${e.message}`);
        continue;
      }
      total += bytes;
      if (bytes > fam.maxPer) report(`G-WORLD-BUDGET: ${f.rel} is ${bytes} bytes > per-file budget ${fam.maxPer}`);
    }
    // THE UNITS ARE PART OF THE LINE. It used to read
    // `(budget ${maxFiles}, ${maxTotal ?? maxPer})`, so for `civil` — which has
    // no aggregate byte cap at all, deliberately — the per-FILE cap 8192 was
    // printed in the slot the reader had just been taught holds the aggregate,
    // beside a measured aggregate. Reproduced with 3 civil files of ~5 KB:
    // `civil 3 files, 15030 bytes (budget 600, 8192)` reads as a 1.8x violation
    // and exits 0. The line advertised a bound that does not exist, and it is
    // this gate's ONLY output for the family. Every term a family actually has
    // is now named and no term it lacks is implied.
    const terms = [`${fam.maxFiles} files`, `${fam.maxPer} B/file`];
    if (fam.maxTotal !== null) terms.push(`${fam.maxTotal} B total`);
    note(`world-budget: ${fam.name} ${files.length} files, ${total} bytes (budget ${terms.join(", ")})`);
    if (files.length > fam.maxFiles) report(`G-WORLD-BUDGET: ${fam.rel} has ${files.length} files > budget ${fam.maxFiles}`);
    if (fam.maxTotal !== null && total > fam.maxTotal)
      report(`G-WORLD-BUDGET: ${fam.rel} totals ${total} bytes > budget ${fam.maxTotal}`);
  }

  if (budgets.cellKm !== 0.5)
    report(`G-WORLD-BUDGET: budgets.cellKm is ${budgets.cellKm} — 0.5 is a pinned constant, not a tuning knob`);

  // Town plans: a QUOTA with a staged delivery, so the shortfall must be
  // visible rather than silently closed. Millcross exists today; E-C9 defers
  // the other 7, so the line reads 1 authored / 8 quota until a future release
  // adds one plan, one node and one census line. Printed, never failed: a gate
  // here would block the release the staging exists to permit.
  if (manifest?.quotas?.townPlans) {
    const dir = join(contentRoot, "towns");
    let authored = 0;
    if (existsSync(dir)) {
      try {
        authored = readdirSync(dir).filter((f) => /^town-.+\.json$/.test(f)).length;
      } catch (e) {
        report(`G-WORLD-BUDGET: towns cannot be listed: ${e.message}`);
      }
    }
    note(`world-budget: town-plans ${authored} authored / ${manifest.quotas.townPlans} quota`);
  }

  // The loop table is the ONE authority for per-stage time budgets: the
  // generator's stage report reads it, Plan B's sheet build reads the `sheets`
  // row, and Plan D's join reads the `join` row. Goal G4's measure is
  // explicitly per-stage thresholds and NOT one aggregate number, so a missing
  // or malformed table means the loop time is unfalsifiable and will drift.
  const STAGES = ["generate", "join", "gates", "sheets", "rasterise", "commit-lock"];
  if (!Array.isArray(budgets.loop)) {
    report(`G-WORLD-BUDGET: world/budgets.json has no "loop" table — per-stage time budgets are goal G4's measure, not an aggregate`);
    return;
  }
  const seen = budgets.loop.map((r) => (r && typeof r === "object" ? r.stage : null));
  for (const st of STAGES) if (!seen.includes(st)) report(`G-WORLD-BUDGET: loop table is missing the "${st}" stage`);
  for (const r of budgets.loop) {
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      report(`G-WORLD-BUDGET: loop table holds a row that is not an object`);
      continue;
    }
    if (!STAGES.includes(r.stage)) report(`G-WORLD-BUDGET: loop table names unknown stage "${r.stage}"`);
    if (!(r.failMs > r.budgetMs))
      report(`G-WORLD-BUDGET: loop stage "${r.stage}" failMs ${r.failMs} must exceed budgetMs ${r.budgetMs}`);
    note(`world-budget: loop ${r.stage} budget ${r.budgetMs} ms, fail ${r.failMs} ms`);
  }
}

// ═══════════════════════ Plan C Task 11 — the world gates ═══════════════════
//
// Five rules over content/world/, all reached from checkWorld() and therefore
// from `--only=spine` (Gate 1) as well as `--require-complete` (Gate 2).
//
// THE HOUSE RULES, restated because every one of them has been broken here
// before and each break shipped a rule that measured nothing:
//   - NEVER THROW. Everything lands in `report`, which is check_content's
//     `fail`. An uncaught throw skips finish() and silently drops every
//     failure recorded before it.
//   - SOFT-SKIP an absent input. A content root with no world/fabric/ is the
//     normal case today — the fabric is committed by Task 13 — so each gate
//     returns on an empty list rather than complaining about it.
//   - PRINT what was measured, on every run, through `note`. A gate that only
//     speaks when it fails cannot be seen to have stopped measuring.
//   - abs() appears nowhere in the geometry. A negative signed shoelace is a
//     G-POLY winding failure, not a magnitude (scripts/lib/spine.mjs:103).
//     Math.abs on a PERCENTAGE or a byte count is not geometry and is fine.

// NOTHING IN THESE GATES ITERATES A FIELD IT HAS NOT CHECKED IS AN ARRAY.
// `for (const x of doc.instances ?? [])` throws on `instances: {}` — the `??`
// only guards null and undefined — and a throw out of a gate skips finish() and
// silently drops every failure recorded before it. Reproduced by
// world-budget.test.mjs's own `instances is not an array` fixture, which
// G-LANDFORM already had a clean message for and these gates crashed on. SHAPE
// is fabric-file.schema.json's business and it says so on the same run; this is
// only about surviving the document long enough to let it.
const arr = (v) => (Array.isArray(v) ? v : []);

// ── G-SEALAND ──────────────────────────────────────────────────────────────
//
// MEASURED ON THE FLAG FIELD, NEVER RECOMPUTED FROM THE MANIFEST. This is the
// ruling STATE §11 records and it is the whole reason the gate can fail: the
// budget closes by construction (65,600 gross − 1,600 interior water = 64,000
// net, and rank selection returns its target BY DEFINITION), so a gate that
// derives the ratio from `budget.grossLandPolygonKm2` and
// `budget.interiorWaterKm2` puts the manifest on both sides of its own test
// and has zero degrees of freedom. What this gate reads instead is
// world.json's CELL CENSUS — the counts P14 took over grid.flags, cell by
// cell — and it re-derives every declared area from them.
//
// Three independent things can therefore go wrong and be seen:
//   (1) the flag field does not close: land + sea != the grid's own cell count;
//   (2) the ratio the census implies is outside the manifest's band;
//   (3) world.json's DECLARED areaKm2 / seaToLandRatio disagree with its own
//       census — which is what a hand-edited world.json looks like.
//
// THE TWO HONEST NUMBERS, both pinned in STATE §11 and neither re-fitted here:
// standing water (SEA + LAKE) gives 1.5000; counting RIVER and DELTA as water
// too gives 1.5381. `interiorWaterKm2` budgets STANDING water, and RIVER and
// DELTA are channel flags on cells that stay land — at 0.5 km a river occupies
// a fraction of its cell and that cell's biome, region membership and
// settlement score all still treat it as ground. world.json's census carries
// only the standing-water counts, so this gate measures 1.5000 and says which
// definition it used in the line it prints.
export function gWorldSeaLand({ world, manifest, fabric = [], report, note }) {
  if (!world) return;                       // no world.json — nothing to measure
  const census = world.census, grid = world.grid;
  // ONE shape guard, and it REPORTS rather than returning quietly: a world.json
  // whose census cannot be read is not "a root without a fabric", it is a
  // broken fabric, and the difference is the whole value of the gate.
  const terms = { "grid.cells": grid?.cells, "census.grossLandCells": census?.grossLandCells,
                  "census.lakeCells": census?.lakeCells, "census.seaCells": census?.seaCells,
                  "census.unownedLandCells": census?.unownedLandCells, cellKm: world.cellKm };
  const missing = Object.entries(terms)
    .filter(([, v]) => typeof v !== "number" || !Number.isFinite(v)).map(([k]) => k);
  if (missing.length) {
    report(`G-SEALAND: world/fabric/world.json cannot be measured — ${missing.join(", ")} ` +
           `${missing.length === 1 ? "is" : "are"} not a finite number, and this gate measures ` +
           `the CELL CENSUS, not the manifest budget`);
    return;
  }

  const cellArea = world.cellKm * world.cellKm;
  const frame = typeof manifest?.frame?.areaKm2 === "number" ? manifest.frame.areaKm2 : 160000;
  const min = typeof manifest?.ratio?.min === "number" ? manifest.ratio.min : 1.2;
  const max = typeof manifest?.ratio?.max === "number" ? manifest.ratio.max : 1.8;

  // (1) THE FLAG FIELD MUST CLOSE, IN CELLS. Every cell is SEA or it is gross
  // land; LAKE is a flag INSIDE gross land and is never a third bucket (STATE
  // §5 — the generator's mirror-image bug counted a lake cell as unowned too
  // and read 646,400).
  const accounted = census.grossLandCells + census.seaCells;
  if (accounted !== grid.cells)
    report(`G-SEALAND: the flag field does not close — ${census.grossLandCells} land + ` +
           `${census.seaCells} sea = ${accounted} cells against ${grid.cells} in the grid ` +
           `(${accounted > grid.cells ? "a cell is counted twice" : "a cell is counted by neither"})`);
  if (census.lakeCells > census.grossLandCells)
    report(`G-SEALAND: ${census.lakeCells} LAKE cells against ${census.grossLandCells} gross land ` +
           `cells — a lake is carved INSIDE gross land and cannot exceed it`);

  const netLandKm2 = (census.grossLandCells - census.lakeCells) * cellArea;
  const waterKm2 = (census.seaCells + census.lakeCells) * cellArea;
  const ratio = netLandKm2 === 0 ? Infinity : waterKm2 / netLandKm2;

  note(`G-SEALAND: ratio ${ratio.toFixed(2)} (net land ${netLandKm2.toFixed(1)} km², water ` +
       `${waterKm2.toFixed(1)} km²) — band ${min.toFixed(2)}–${max.toFixed(2)}, measured on ` +
       `${census.seaCells} SEA + ${census.lakeCells} LAKE cells of ${grid.cells}`);

  // (1b) the same closure in km², which is a different claim: a grid that
  // closes in cells still misses the frame if its cell size or cell count is
  // not a tiling of it.
  const total = netLandKm2 + waterKm2;
  if (Math.abs(total - frame) > 1)
    report(`G-SEALAND: land + sea = ${total} km² != ${frame} ± 1 — ` +
           `${census.unownedLandCells} cells are unowned`);

  // (2) THE BAND.
  if (ratio < min || ratio > max) {
    const landMin = frame / (1 + max), landMax = frame / (1 + min);
    report(
      `G-SEALAND: world sea/land is ${ratio.toFixed(2)} (land ${netLandKm2.toFixed(1)} km², sea ` +
      `${waterKm2.toFixed(1)} km²) — band is ${min.toFixed(2)}–${max.toFixed(2)} ` +
      `(land ${Math.round(landMin)}–${Math.round(landMax)} km²); ` +
      `re-run the sea-level rank selection, do not reroll toward the target`,
    );
  }

  // (3) THE DECLARED NUMBERS AGAINST THE CENSUS THEY CLAIM TO SUMMARISE. This
  // is what makes a hand-edited world.json a failure rather than a new truth.
  // The tolerance is 1 km² = 4 cells, the same slack the frame closure takes,
  // because every committed number passes q() = round(v*100)/100 first.
  const declared = world.areaKm2;
  for (const [key, measured] of [["netLand", netLandKm2], ["water", waterKm2], ["total", total]]) {
    const d = declared?.[key];
    if (typeof d !== "number" || !Number.isFinite(d))
      report(`G-SEALAND: world.json declares no numeric areaKm2.${key}`);
    else if (Math.abs(d - measured) > 1)
      report(`G-SEALAND: world.json declares areaKm2.${key} ${d} km² and its own cell census ` +
             `measures ${measured.toFixed(1)} km² — the census is the authority, so the declared ` +
             `number is what is wrong`);
  }
  const dr = world.seaToLandRatio;
  if (typeof dr !== "number" || !Number.isFinite(dr))
    report(`G-SEALAND: world.json declares no numeric seaToLandRatio`);
  else if (Math.abs(dr - ratio) > 0.01)
    report(`G-SEALAND: world.json declares seaToLandRatio ${dr} and its own cell census measures ` +
           `${ratio.toFixed(4)} — the census is the authority`);

  // (4) THE PER-CONTINENT CENSUS, JOINED TO THE WORLD'S.
  //
  // Without this, moving 5,000 cells from `land` to `lake` inside
  // continent-02.json changed NOTHING: interior water up 1,250 km², world
  // `lakeCells` still 6,400, and the run byte-identical to baseline. G-SEALAND
  // read only world.json; G-TRUNK-AREA reads only the GROSS sum, which is
  // invariant to the land/lake split BY CONSTRUCTION. The only thing holding
  // the join was `assert.equal(lake, world.census.lakeCells)` in
  // generate-world.test.mjs — a generator acceptance test, not a gate on a
  // content root. Protected against the generator, not against the tree.
  //
  // TWO CLAUSES, ARMED DIFFERENTLY, because they are different claims:
  //
  //   per row — always, for a row whose fabric file is loaded. `landCells` is
  //     GROSS (generate-world.test.mjs:410), so it must equal that file's own
  //     land + lake + unowned.
  //   the LAKE column — only where the declared continents ACCOUNT FOR the
  //     world's gross land. A partial root (world-gates' fixtures carry one
  //     continent of thirteen on purpose) makes no claim about the world's lake
  //     total, and gating it there would fail a fixture for being a fixture.
  //
  // An unreadable cellCensus is skipped here and reported by
  // fabric-file.schema.json, which `require`s the object and all three integer
  // members — a second message for the same defect sends the reader twice.
  const byFile = new Map(arr(fabric).map((d) => [d.file, d]));
  const declaredContinents = arr(world.continents);
  let joined = 0, sumGross = 0, sumLake = 0;
  for (const row of declaredContinents) {
    const doc = typeof row?.fabric === "string" ? byFile.get(row.fabric.split("/").pop()) : undefined;
    const cc = doc?.cellCensus;
    const terms = [cc?.land, cc?.lake, cc?.unowned];
    if (!terms.every((v) => typeof v === "number" && Number.isFinite(v))) continue;
    joined++;
    const gross = terms[0] + terms[1] + terms[2];
    sumGross += gross;
    sumLake += terms[1];
    if (typeof row.landCells === "number" && row.landCells !== gross)
      report(`G-SEALAND: world.json declares ${row.landCells} land cells for ${row.id} and ` +
             `${doc.file}'s own census measures ${gross} gross (land ${terms[0]} + lake ` +
             `${terms[1]} + unowned ${terms[2]}) — the per-continent fabric is the authority`);
  }
  if (joined > 0) {
    const covers = sumGross === census.grossLandCells;
    if (covers && sumLake !== census.lakeCells)
      report(`G-SEALAND: the ${joined} joined continents carry ${sumLake} LAKE cells and world.json ` +
             `declares ${census.lakeCells} — the per-continent fabric is the authority`);
    note(`G-SEALAND: fabric census joined for ${joined} of ${declaredContinents.length} declared ` +
         (covers ? `continents — ${sumGross} gross land cells, ${sumLake} lake`
                 : `continents — ${sumGross} of ${census.grossLandCells} gross land cells, so the ` +
                   `LAKE column is not joined`));
  }
}

// THE TRUNK DIVERGENCE, PRINTED ON EVERY RUN THAT HAS BOTH LAYERS.
//
// Plan C's whole architecture is two layers describing two different worlds
// until Plan E's redraw: the committed trunk still says 24.68 : 1 while the
// fabric says 1.50 : 1, and that is INTENDED. A green G-SEALAND must never be
// read as "the chart is redrawn", so the gate says the two numbers out loud
// side by side whenever a trunk is present to compare against.
//
// It lives in its own function because checkWorld runs at the TOP of
// checkSpine — before the node tree exists — for the roots that have a world/
// and no spine/ (STATE §5). The trunk term is the one thing G-SEALAND cannot
// know there, so it is printed later, from the same gate name.
// IT PRINTS THE TWO RATIOS, not two land areas, and the areas after them as the
// basis. Two areas make the reader do the division: 6,243.5 against 64,000.0 is
// the 24.63 : 1 chart every other document quotes, and nothing on the line said
// so. A ratio is also the SAME UNIT as the band printed two lines above
// (1.20–1.80), so the divergence can be read against the thing it violates
// instead of against nothing. Review suggestion, adopted 2026-08-23 — with the
// areas kept, because a ratio alone hides which side moved.
//
// `Number.isFinite(trunkLandKm2)` is NOT dead code, though it survived a
// mutation for want of a fixture: placementArea returns Infinity for a rect
// whose sides overflow, which spine-node.schema.json's bare `{"type":
// "number"}` accepts. What IS dead is checkWorldTrunk's `tree ? … : null`
// ternary — buildTree always returns an object — and it is gone.
//
// A trunk of ZERO land is not a measurement either, and printing `trunk land
// 0.0 km²` presented one: a spine with no continent-tier node has no trunk to
// diverge FROM, and its ratio would be a division by zero. Absent, like the
// no-spine case, rather than a confident nothing.
export function gWorldSeaLandTrunk({ world, manifest, trunkLandKm2, note }) {
  if (!world || typeof trunkLandKm2 !== "number" || !Number.isFinite(trunkLandKm2)) return;
  if (trunkLandKm2 <= 0) return;
  const census = world.census;
  if (typeof census?.grossLandCells !== "number" || typeof census?.lakeCells !== "number"
      || typeof world.cellKm !== "number") return;
  const netLandKm2 = (census.grossLandCells - census.lakeCells) * (world.cellKm * world.cellKm);
  if (netLandKm2 <= 0) return;
  const frame = typeof manifest?.frame?.areaKm2 === "number" ? manifest.frame.areaKm2 : 160000;
  const trunkRatio = (frame - trunkLandKm2) / trunkLandKm2;
  const fabricRatio = (frame - netLandKm2) / netLandKm2;
  note(`G-SEALAND: trunk ${trunkRatio.toFixed(2)} : 1 vs fabric ${fabricRatio.toFixed(2)} : 1 ` +
       `(trunk land ${trunkLandKm2.toFixed(1)} km², fabric net land ${netLandKm2.toFixed(1)} km²) ` +
       `— the trunk is redrawn in Plan E, not here`);
}

// ── G-TRUNK-AREA ───────────────────────────────────────────────────────────
//
// THE gate the two-layer architecture creates: without it G-SEALAND and
// G-ATLAS-ROLLUP measure two different worlds and both can be green while the
// chart is wrong. It ACTIVATES PER NODE via `provenance.generator.fabric`, so
// it is dormant on today's 44 hand-authored nodes (none of which is
// `authored: "generated"`) and live on all 25 generated world-tier nodes of a
// draft root.
//
// TWO PLAN ERRORS ARE CORRECTED HERE, both reproduced against the draft root:
//
//  1. The plan scores the polygon against `f.cellCensus.land`, which is NET
//     land — the cells the REGIONS tile. The trunk polygon is the coast
//     contour and it encloses the continent's interior lakes, so the two
//     differ by exactly `interiorWaterKm2`. Measured: c02 Wealdmarch reads
//     +9.54% and c06 Reedstrand +5.22% against a ±3% tolerance — two failures
//     on a correct world. Against GROSS land (land + lake + unowned) every one
//     of the thirteen is inside tolerance, worst −1.36%.
//  2. The plan resolves the cited path against the per-continent fabric files
//     only. The twelve generated OCEAN and SEA nodes cite
//     `content/world/fabric/world.json`, which loadFabric returns separately —
//     so all twelve reported `does not resolve`. A water polygon has no land
//     census to be scored against, and skipping it silently is exactly the
//     dormant-gate failure this task exists to prevent; it is scored against
//     the manifest's own declared `polygonKm2` for that node instead.
//     Measured on the draft root: worst 0.30%.
export function gWorldTrunkArea({ nodes, fabric, world, manifest, placementArea, report, note }) {
  const byPath = new Map(fabric.map((f) => [`content/world/fabric/${f.file}`, f]));
  const worldPath = world?.file ? `content/world/fabric/${world.file}` : null;
  const declaredWater = new Map();
  for (const w of [...arr(manifest?.oceans), ...arr(manifest?.seas)])
    if (w && typeof w.nodeId === "string" && typeof w.polygonKm2 === "number")
      declaredWater.set(w.nodeId, w.polygonKm2);

  let scored = 0, land = 0, water = 0, worstPct = 0, worstId = null;
  for (const node of arr(nodes)) {
    const path = node?.provenance?.generator?.fabric;
    if (typeof path !== "string") continue;      // the activation key, per node

    let expected = null, what = null;
    if (byPath.has(path)) {
      const f = byPath.get(path);
      const c = f.cellCensus;
      const cellKm = typeof f.cellKm === "number" ? f.cellKm : 0.5;
      if (typeof c?.land !== "number" || typeof c?.lake !== "number" || typeof c?.unowned !== "number") {
        report(`G-TRUNK-AREA: ${node.id}: ${path} carries no readable cellCensus {land, lake, unowned}`);
        continue;
      }
      // GROSS land: the coast contour encloses the lakes. See (1) above.
      expected = (c.land + c.lake + c.unowned) * cellKm * cellKm;
      what = `fabric gross census ${expected.toFixed(1)} km²`;
      land++;
    } else if (worldPath !== null && path === worldPath) {
      if (!declaredWater.has(node.id)) {
        report(`G-TRUNK-AREA: ${node.id}: cites ${path}, which carries no per-node land census, ` +
               `and content/world/manifest.json declares no polygonKm2 for it either — nothing ` +
               `can score this polygon`);
        continue;
      }
      expected = declaredWater.get(node.id);
      what = `manifest polygon ${expected.toFixed(1)} km²`;
      water++;
    } else {
      report(`G-TRUNK-AREA: ${node.id}: provenance.generator.fabric "${path}" does not resolve`);
      continue;
    }

    if (expected === 0) {
      report(`G-TRUNK-AREA: ${node.id}: the area it is scored against is 0`);
      continue;
    }
    const polyKm2 = placementArea({ placement: node.placement });
    if (typeof polyKm2 !== "number" || !Number.isFinite(polyKm2)) {
      report(`G-TRUNK-AREA: ${node.id}: placement has no measurable area`);
      continue;
    }
    scored++;
    const pct = ((polyKm2 - expected) / expected) * 100;
    if (worstId === null || Math.abs(pct) > Math.abs(worstPct)) { worstPct = pct; worstId = node.id; }
    if (Math.abs(pct) > 3)
      report(
        `G-TRUNK-AREA: ${node.id}: trunk polygon ${polyKm2.toFixed(1)} km² vs ${what} ` +
        `(${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%, tolerance ±3%) — re-simplify the outline from ` +
        `the fabric, do not hand-edit the ring`,
      );
  }
  // DORMANT MEANS SILENT: with no node citing a fabric file the gate prints
  // nothing at all, which is what keeps today's 44-node committed root's output
  // byte-for-byte what it was. The moment it has anything to score it says how
  // much it scored and how close the worst one came.
  if (scored > 0)
    note(`G-TRUNK-AREA: scored ${scored} nodes (${land} against a fabric census, ${water} against ` +
         `the manifest), worst drift ${worstPct >= 0 ? "+" : ""}${worstPct.toFixed(2)}% on ` +
         `${worstId} — tolerance ±3%`);
}

// ── G-POI ──────────────────────────────────────────────────────────────────
//
// POI is DERIVED, never stored: drawn(instance) = the region is surveyed OR the
// instance is named. That is spec §6.4 rule 2 ("no interior detail inside a
// reported region … at most one named landform") as one line, and it is why a
// reported region's POI count is 0 while it still carries eight texture
// instances.
//
// The "at most one" half is a rule too, and the plan's code does not carry it:
// its exemption for a named landform in a reported region is UNBOUNDED, so a
// reported region carrying five named landforms passed. Measured on the draft
// root: exactly 60 reported regions carry exactly one named instance each, so
// the cap is at its limit everywhere it applies and a sixty-first mark is the
// thing it exists to catch.
export function gWorldPoi({ fabric, budgets, report, note, warn = () => {} }) {
  if (fabric.length === 0) return;
  const MIN = 12, MAX = 30;
  // ── THE DECLARED SHORTFALLS ────────────────────────────────────────────
  //
  // Five of the forty surveyed regions on the committed seed cannot reach
  // twelve, and the seam-7 adjudication (STATE §18) settled that they are
  // RECORDED rather than loosened away: fixing P10's supply cannot close
  // c05/r06 at all, and making the floor a warning is a rule that cannot fail.
  // What that adjudication did not reach is that recording them in a test
  // leaves the COMMITTED root at five failures the moment the fabric is
  // committed — which reds Gate 1 and acceptance criterion 3 — so the record
  // has to live somewhere the gate can read it.
  //
  // It is a DECLARATION, not an exemption switch, and all three clauses are
  // load-bearing:
  //   (1) a DECLARED region below the floor is a warning naming its measured
  //       count and the committed reason;
  //   (2) an UNDECLARED region below the floor is a hard failure, unchanged —
  //       so a sixth thin region still reds;
  //   (3) a DECLARED region that is NOT below the floor is a hard failure —
  //       so a declaration cannot outlive its cause, and Plan E's redraw is
  //       told to delete the row rather than leaving a stale one behind.
  // Clause (3) is also what stops the list becoming a place to put anything.
  // A declared id whose CONTINENT is loaded but whose region is not present at
  // all is the same failure, for the same reason; a continent that is not
  // loaded says nothing about its regions, which is what keeps partial fixture
  // roots honest.
  const declared = new Map(Object.entries(budgets?.poi?.supplyLimitedSurveyedRegions ?? {})
    .filter(([, v]) => typeof v === "string"));
  const seenRegion = new Set();
  const loadedContinents = new Set();
  let surveyed = 0, reported = 0, thin = 0, fat = 0, declaredThin = 0;
  const thinnest = [];
  for (const f of fabric) {
    // A document with NO `regions` array is not a region-bearing document and
    // this gate has nothing to attribute POIs to. It is SKIPPED rather than
    // reported, and the reason is the soft-skip discipline one level down: Plan
    // B's G-LANDFORM fixtures write `world/fabric/c01.json` as a stub carrying
    // only `instances`, and reporting an orphan for each of its 120 rows reds
    // four committed tests that have nothing to do with POI. The missing key is
    // a SHAPE failure and fabric-file.schema.json says so on every root that
    // carries the schema — which is every real one, since Task 13 commits the
    // fabric beside it. Pinned by "a fabric file with no regions is a schema
    // failure" below, so the rule is reachable, in the venue that owns it.
    if (!Array.isArray(f.regions)) continue;
    const regions = arr(f.regions);
    const byRegion = new Map(regions.map((r) => [r?.id, r]));
    const counts = new Map(regions.map((r) => [r?.id, 0]));
    const namedInReported = new Map();
    for (const inst of arr(f.instances)) {
      const r = byRegion.get(inst?.region);
      if (!r) { report(`G-POI: instance ${inst?.id} names region "${inst?.region}", which is not in ${f.file}`); continue; }
      if (r.survey === "surveyed") counts.set(r.id, counts.get(r.id) + 1);
      // A reported region's named landform is EXEMPT from the POI count — it is
      // the one mark the honest-frontier policy allows — but it is COUNTED
      // separately, because "at most one" is the other half of the same rule.
      else if (inst.named === true) namedInReported.set(r.id, (namedInReported.get(r.id) ?? 0) + 1);
    }
    for (const s of arr(f.settlements))
      if (counts.has(s?.region)) counts.set(s.region, counts.get(s.region) + 1);
      else report(`G-POI: settlement ${s?.id} names region "${s?.region}", which is not in ${f.file}`);
    for (const d of arr(f.dungeonAnchors))
      if (counts.has(d?.region)) counts.set(d.region, counts.get(d.region) + 1);
      else report(`G-POI: dungeon anchor ${d?.handle} names region "${d?.region}", which is not in ${f.file}`);
    // Roads are inter-region and are counted at their endpoints' settlements.
    // Spec §6.4 rule 2 also forbids a road INSIDE a reported region, which is
    // unsatisfiable on this world — 20 of 38 roads and 956 of 1,666 points run
    // through reported ground, because 120 of the 160 regions are reported and
    // a continent-spanning MST cannot avoid them (STATE §5). That is a SPEC
    // error, recorded there, and Plan E decides whether the ink is drawn; it is
    // deliberately not a rule here, and this comment is why the loop the plan
    // wrote as dead code is absent instead of empty.

    if (typeof f.continent === "string") loadedContinents.add(f.continent);
    for (const r of regions) {
      if (r === null || typeof r !== "object") continue;   // shape is the schema's business
      seenRegion.add(r.id);
      const n = counts.get(r.id);
      const why = declared.get(r.id);
      if (r.survey === "surveyed") {
        surveyed++;
        if (n < MIN) { thin++; thinnest.push(`${r.id} ${n}`); }
        if (n > MAX) fat++;
        if (n < MIN && why !== undefined) {
          declaredThin++;
          warn(`G-POI: region ${r.id} (surveyed) has ${n} points of interest against a floor of ${MIN} — DECLARED in budgets.json poi.supplyLimitedSurveyedRegions: ${why}`);
        } else if (n < MIN || n > MAX)
          report(`G-POI: region ${r.id} (surveyed) has ${n} points of interest — band is ${MIN}–${MAX}`);
        else if (why !== undefined)
          report(`G-POI: region ${r.id} is declared supply-limited in budgets.json but carries ${n} points of interest — the declaration is stale, delete the row`);
      } else {
        reported++;
        if (n !== 0)
          report(`G-POI: region ${r.id} (reported) has ${n} points of interest — must be 0`);
        const named = namedInReported.get(r.id) ?? 0;
        if (named > 1)
          report(`G-POI: region ${r.id} (reported) carries ${named} named landforms — spec §6.4 rule 2 allows at most one`);
      }
      if (r.survey === "reported" && r.terrainKind !== null && r.terrainKind !== undefined)
        report(`G-POI: region ${r.id} is reported but carries terrainKind "${r.terrainKind}" — reported ⇒ terrainKind null`);
    }
  }
  // Clause (3)'s other half: a declared region that is not there at all. Only
  // judged for a continent whose fabric file was actually loaded — a root
  // carrying one continent of thirteen makes no claim about the other twelve,
  // which is exactly what world-gates' single-continent fixtures are.
  for (const [id, why] of declared) {
    if (seenRegion.has(id)) continue;
    const continent = String(id).split("/")[0];
    if (!loadedContinents.has(continent)) continue;
    report(`G-POI: budgets.json declares region ${id} supply-limited, but ${continent}'s fabric has no such region — the declaration is stale, delete the row (${why.slice(0, 60)}…)`);
  }
  note(`G-POI: ${surveyed} surveyed regions (band ${MIN}–${MAX}: ${thin} thin of which ${declaredThin} declared, ${fat} over) and ` +
       `${reported} reported regions (must be 0)` +
       (thinnest.length ? ` — thin: ${thinnest.join(", ")}` : ""));
}

// ── G-ORDER ────────────────────────────────────────────────────────────────
//
// The ordering key is (-sizeKm, contentHash) — NEVER insertion order, NEVER
// lore.order. R3's failure mode (a member silently disappearing or silently
// reordering) applies identically to a handle ledger.
//
// R3's mitigation is THREE-part: (1) the sort key is content, never
// lore.order; (2) the digest is committed and recomputed; (3) the resulting
// order is a DENSE PERMUTATION of 0..n-1, which is the clause that catches a
// member silently vanishing. THE PLAN'S CODE CARRIES TWO OF THE THREE and its
// own comment claims all three — clause (3) is implemented here.
//
// This function carries all three FOR THE HANDLE LEDGERS, and only those.
// Clause (3) applies to the REGION order too, but `order` is not a fabric
// field: content/schemas/fabric-file.schema.json is additionalProperties:false
// on regions[] and does not list it, so a fabric region carrying one would be
// schema-invalid. The resolver mints `order` onto the RESOLVED zones from the
// same rule, so the region half is asserted where those documents are already
// loaded — Plan D's gZoneOrder.
export function gWorldOrder({ handles, orderHandlesFn, orderDigestFn, report, note }) {
  if (handles.length === 0) return;
  let rows = 0;
  for (const ledger of arr(handles)) {
    const list = Array.isArray(ledger.handles) ? ledger.handles : null;
    if (list === null) {
      report(`G-ORDER: ${ledger.file ?? ledger.continent}: handles is not an array`);
      continue;
    }
    rows += list.length;
    const recomputed = orderHandlesFn({ handles: list.map(({ rank, ...h }) => h) });
    const digest = orderDigestFn({ handles: recomputed });
    if (ledger.orderDigest !== digest)
      report(`G-ORDER: ${ledger.continent} orderDigest ${ledger.orderDigest} != computed ${digest}`);

    // (3) DENSE PERMUTATION. A hand-edit that drops a row and leaves the
    // remaining ranks alone is invisible to the digest ONLY if the digest is
    // recomputed by the same hand — but a dropped row makes 0..n-1 have a hole,
    // and that is arithmetic no edit can talk its way out of.
    const seenRank = new Set();
    for (const h of list) {
      if (!Number.isInteger(h.rank) || h.rank < 0 || h.rank >= list.length)
        report(`G-ORDER: ${ledger.continent} handle "${h.handle}" has rank ${h.rank}, outside 0..${list.length - 1}`);
      else if (seenRank.has(h.rank))
        report(`G-ORDER: ${ledger.continent} lists rank ${h.rank} twice — the order is not a dense permutation of 0..${list.length - 1}`);
      else seenRank.add(h.rank);
    }
    for (let i = 0; i < recomputed.length; i++)
      if (list[i]?.handle !== recomputed[i].handle) {
        report(`G-ORDER: ${ledger.continent} lists "${list[i]?.handle}" at position ${i}, but the ` +
               `(-sizeKm, contentHash) order puts "${recomputed[i].handle}" there`);
        break;                                 // one line per ledger, not n
      }

    // (3b) THE `rank` COLUMN, AGAINST THE POSITION IT RECORDS. All three
    // clauses above miss it and every one of them misses it for a different
    // reason: the digest is recomputed from `list.map(({rank, ...h}) => h)`,
    // which STRIPS rank, and orderHandles re-mints it from the sorted position,
    // so the COMMITTED values never enter the hash even though orderDigestOf's
    // body string begins `${h.rank}:`; clause (3) sees range and uniqueness
    // only, and an arbitrary permutation is still dense; and the positional
    // loop compares HANDLES, never rank against i. Measured: swapping two
    // adjacent ranks, reversing all 301 of c05's, and applying an arbitrary
    // dense permutation each produced ZERO new failures.
    //
    // `rank` is a REQUIRED field of handle-ledger.schema.json and Plan D binds
    // to these ledgers, so it is the published ordinal — it has to say where
    // the row actually is. Guarded on Number.isInteger so a non-integer rank
    // earns clause (3)'s message and not two for one defect.
    for (let i = 0; i < list.length; i++)
      if (Number.isInteger(list[i]?.rank) && list[i].rank !== i) {
        report(`G-ORDER: ${ledger.continent} gives "${list[i].handle}" rank ${list[i].rank} at ` +
               `position ${i} — rank is the row's own position in the committed order`);
        break;                                 // one line per ledger, not n
      }

    // THE TOTALITY CLAUSE, on the REAL key. The plan compares `sizeKm * sizeKm`
    // and calls it area — squaring is monotone on positive numbers so it is the
    // same order under a wrong name, and the message it prints ("differ by 0
    // km²") reads as though the SIZE alone decides the order. It does not: the
    // key is the PAIR, and two rows are unordered only when BOTH terms match.
    // A near-tie in sizeKm with differing hashes is perfectly legal and is a
    // passing case in the suite.
    for (let i = 1; i < recomputed.length; i++) {
      const a = recomputed[i - 1], b = recomputed[i];
      if (a.sizeKm === b.sizeKm && a.contentHash === b.contentHash)
        report(`G-ORDER: ${a.handle} and ${b.handle} share the whole ordering key ` +
               `(sizeKm ${a.sizeKm}, contentHash ${a.contentHash}) — ordering is not total`);
    }

    const seen = new Set();
    for (const h of list) {
      if (seen.has(h.handle)) report(`G-ORDER: ${ledger.continent} lists handle "${h.handle}" twice`);
      seen.add(h.handle);
      if (!/^c[0-9]{2}\/[a-z-]+\/h-[0-9a-f]{4,6}$/.test(h.handle))
        report(`G-ORDER: handle "${h.handle}" does not match the grammar cNN/<group>/h-<hex>`);
    }
  }
  note(`G-ORDER: ${handles.length} handle ledgers, ${rows} handles, each order recomputed from ` +
       `(-sizeKm, contentHash) and compared to its committed digest`);
}

// ── G-VERTEX-BUDGET (landform + region tiers) and G-POLY over the fabric ────
//
// The coverage regression spec §8.4 states rather than hides: with a 36-node
// trunk, the 160 REGIONS and the 1,740 LANDFORM INSTANCES sit outside
// tree.byId, so G-POLY and G-VERTEX-BUDGET — which walk tree.byId.values() —
// cannot see either of them. The plan's Step 5c closes the instance half; the
// region half is the same seam named in the same sentence and closes here too.
// The schemas' maxItems catch the vertex cap earlier and more bluntly; this
// exists so the failure NAMES THE REMEDY instead of surfacing as
// `instances/412/geometry/ring must NOT have more than 40 items`.
//
// abs() appears NOWHERE here. A negative signed shoelace is a G-POLY failure,
// not a magnitude — the same discipline scripts/lib/spine.mjs holds.
export const MAX_INSTANCE_RING = 40;
export const MAX_REGION_RING = 200;

export function gWorldInstanceGeometry({ fabric, shoelaceArea, selfIntersects, report, note }) {
  if (fabric.length === 0) return;
  let areas = 0, lines = 0, points = 0, rings = 0, holes = 0, widestInstance = 0, widestRegion = 0;

  const checkRing = (label, what, ring, cap) => {
    if (ring.length > cap)
      report(`G-VERTEX-BUDGET: ${label} has ${ring.length} vertices > ${cap} for tier ${what}`);
    if (ring.length < 3) {
      report(`G-POLY: ${label} has ${ring.length} points — a closed ring needs at least 3`);
      return;
    }
    const a = shoelaceArea({ points: ring });
    if (!(a > 0))
      report(`G-POLY: ${label} winding is ${a.toFixed(6)} — a ring must be OPEN with a STRICTLY POSITIVE signed shoelace`);
    if (selfIntersects({ points: ring }))
      report(`G-POLY: ${label} self-intersects`);
  };

  for (const f of fabric) {
    for (const inst of arr(f.instances)) {
      const g = inst?.geometry;
      if (!g || typeof g !== "object") continue;   // shape is the schema's business
      if (g.shape === "point") { points++; continue; }
      const ring = g.shape === "area" ? g.ring : g.shape === "line" ? g.points : null;
      if (!Array.isArray(ring)) continue;
      if (ring.length > widestInstance) widestInstance = ring.length;
      if (g.shape !== "area") {
        lines++;
        // A LINE has no winding and no closure, so it takes the vertex cap and
        // nothing else — closing it with the ring rules would reject every
        // legitimate two-point levee.
        if (ring.length > MAX_INSTANCE_RING)
          report(`G-VERTEX-BUDGET: instance ${inst.id} ring has ${ring.length} vertices > ${MAX_INSTANCE_RING} for tier landform-instance`);
        continue;
      }
      areas++;
      checkRing(`instance ${inst.id} ring`, "landform-instance", ring, MAX_INSTANCE_RING);
    }
    for (const r of arr(f.regions)) {
      for (const ring of arr(r?.rings)) {
        rings++;
        if (Array.isArray(ring) && ring.length > widestRegion) widestRegion = ring.length;
        if (Array.isArray(ring)) checkRing(`region ${r?.id} ring`, "region", ring, MAX_REGION_RING);
      }
      // A HOLE is a boundary too: the same winding and simplicity rules apply,
      // and assembleRings returns them positively wound for exactly that reason
      // (the nesting, not the sign, is what makes it a hole).
      for (const ring of arr(r?.holes)) {
        holes++;
        if (Array.isArray(ring) && ring.length > widestRegion) widestRegion = ring.length;
        if (Array.isArray(ring)) checkRing(`region ${r?.id} hole`, "region", ring, MAX_REGION_RING);
      }
    }
  }
  note(`G-POLY: ${areas} area + ${lines} line + ${points} point instances, ${rings} region rings ` +
       `and ${holes} holes checked — widest instance ${widestInstance}/${MAX_INSTANCE_RING}, ` +
       `widest region ${widestRegion}/${MAX_REGION_RING}`);
}
