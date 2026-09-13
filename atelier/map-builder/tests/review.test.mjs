import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { createRepo } from "../lib/repo.mjs";
import { continentMetrics, buildReview } from "../lib/review.mjs";
import { SHEETS } from "../../mapforge/render-sheet.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI = join(REPO, "atelier/mapforge/generate-world.mjs");
const SEED = "7c9e4a2f8b1d6e03";

// One real generation, one temp/test-owned out dir (never build/mapforge/, so
// no other test's fixture is touched), reused by every test below — the same
// "spawn once in before()" shape generate-world.test.mjs uses, and the same
// LOOP BUDGET tolerance (the run itself is still a complete, readable draft
// when that happens; only the wall clock tripped).
let OUT = null;
before(() => {
  OUT = mkdtempSync(join(tmpdir(), "mb-review-"));
  try {
    execFileSync(process.execPath,
      [CLI, "--seed", SEED, "--out", OUT, "--no-png", "--stage-report", "--json-report"],
      { encoding: "utf8", cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (!/generate-world: LOOP BUDGET/.test(e.stderr ?? ""))
      throw new Error(`generate-world failed for a reason other than the loop budget:\n${e.stdout}\n${e.stderr ?? ""}`);
  }
});
after(() => { if (OUT) rmSync(OUT, { recursive: true, force: true }); });

test("continentMetrics reads the committed fabric dir with numeric fields", () => {
  const rows = continentMetrics({ fabricDir: join(REPO, "content/world/fabric") });
  assert.ok(rows.length >= 1);
  for (const r of rows) {
    assert.match(r.id, /^c\d+$/);
    assert.equal(typeof r.landKm2, "number");
    assert.equal(typeof r.regions, "number");
    assert.equal(typeof r.settlements, "number");
  }
});

test("continentMetrics reads a draft out dir's fabric too", () => {
  const rows = continentMetrics({ fabricDir: join(OUT, "content/world/fabric") });
  assert.ok(rows.length >= 1);
});

test("buildReview: draft/current/band/gates/dryRun shapes, deltas sorted by |Δ landKm2| desc", () => {
  const repo = createRepo({ repoRoot: REPO });
  const job = { seed: SEED, outDir: OUT,
    metrics: { seaLand: 1.5, landKm2: 64000, settlements: 40, landforms: 1740, regions: 160 }, dryRun: true };
  const review = buildReview({ repo, job, sheets: SHEETS });

  assert.equal(review.draft.seed, SEED);
  assert.deepEqual(review.draft.metrics, job.metrics);
  assert.ok(review.draft.continents.length >= 1);

  assert.equal(review.current.seed, repo.currentSeed());
  const worldJson = JSON.parse(readFileSync(join(REPO, "content/world/fabric/world.json"), "utf8"));
  assert.equal(review.current.ratio, worldJson.seaToLandRatio);
  assert.ok(review.current.continents.length >= 1);

  for (let i = 1; i < review.deltas.length; i++)
    assert.ok(Math.abs(review.deltas[i - 1].landKm2.delta) >= Math.abs(review.deltas[i].landKm2.delta),
      `deltas not sorted at index ${i}`);
  for (const d of review.deltas) {
    assert.equal(d.landKm2.delta, d.landKm2.draft - d.landKm2.current);
    assert.equal(d.regions.delta, d.regions.draft - d.regions.current);
    assert.equal(d.settlements.delta, d.settlements.draft - d.settlements.current);
  }

  assert.deepEqual(review.band, repo.ratioBand());
  assert.deepEqual(review.gatesAtPublish, Object.keys(repo.budgets.promotion.gateRulesThatMustBeGreen));
  assert.equal(review.dryRun, true);
  assert.ok(Array.isArray(review.knownTodos));
});

test("buildReview: sheets.length === 17, only fabric+overlay carry a draftSvg, every currentSvg exists", () => {
  const repo = createRepo({ repoRoot: REPO });
  const job = { seed: SEED, outDir: OUT, metrics: null, dryRun: false };
  const review = buildReview({ repo, job, sheets: SHEETS });

  assert.equal(review.sheets.length, 17);
  const withDraft = review.sheets.filter((s) => s.draftSvg !== null).map((s) => s.id).sort();
  assert.deepEqual(withDraft, ["fabric", "overlay"]);
  assert.ok(existsSync(join(OUT, "sheets/fabric.svg")));
  assert.ok(existsSync(join(OUT, "sheets/overlay.svg")));
  for (const s of review.sheets) assert.ok(existsSync(join(REPO, s.currentSvg.slice(1))), `${s.currentSvg} missing on disk`);

  // m4 (Batch F round 1): OUT is an ABSOLUTE outDir (mkdtemp, outside the
  // repo) — `/${job.outDir}/${draftRel}` used to yield a protocol-relative
  // "//tmp/.../fabric.svg" URL here. Assert the exact, single-leading-slash
  // string posix.join now produces.
  const fabric = review.sheets.find((s) => s.id === "fabric");
  assert.equal(fabric.draftSvg, posix.join("/", OUT, "sheets/fabric.svg"));
  assert.ok(!fabric.draftSvg.startsWith("//"), `draftSvg is protocol-relative: ${fabric.draftSvg}`);
});

test("continentMetrics.landKm2 agrees with generate-world's own --json-report for the same draft (I4)", () => {
  const reportPath = join(OUT, "report.json");
  assert.ok(existsSync(reportPath), "before() ran --json-report; report.json should exist");
  const report = JSON.parse(readFileSync(reportPath, "utf8"));

  const rows = continentMetrics({ fabricDir: join(OUT, "content/world/fabric") });
  assert.ok(rows.length >= 1);
  const byId = new Map(report.continents.map((c) => [c.id, c]));
  for (const r of rows) {
    const rc = byId.get(r.id);
    assert.ok(rc, `report.json has no continent ${r.id}`);
    // Same source of truth (generate-world.mjs's continentCensus, imported —
    // not re-derived) and the same `.toFixed(1)` formatting jsonReport uses,
    // so these must be EXACTLY equal, not merely close.
    assert.equal(r.landKm2, rc.landKm2, `${r.id}: review landKm2 disagrees with report.json`);
  }
});

test("continentMetrics throws a clear error when cellCensus is missing (no silent NaN)", () => {
  const badDir = mkdtempSync(join(tmpdir(), "mb-review-badfixture-"));
  try {
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, "continent-01.json"),
      JSON.stringify({ continent: "c01", regions: [], settlements: [] })); // no cellCensus/cellKm
    assert.throws(() => continentMetrics({ fabricDir: badDir }), /cellCensus/);
  } finally {
    rmSync(badDir, { recursive: true, force: true });
  }
});
