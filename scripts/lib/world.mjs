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
  const empty = { present: false, manifest: undefined, budgets: undefined, fabric: [], world: null, handles: [], errors };
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

  return { present: true, manifest, budgets, fabric, world, handles, errors };
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
