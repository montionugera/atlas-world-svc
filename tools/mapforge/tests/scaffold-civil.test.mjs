// Plan D — the bound-record scaffolder.
//
// 336 records cannot be hand-typed, and they must not be hand-typed: a bound
// record's handle, type and size band are FACTS ABOUT THE LEDGER, and a typo
// in any of them is a silent rebinding. The scaffolder mints them by set
// reconciliation, and refuses to touch the lore of a record whose prose is
// "authored" — that half IS hand-written and the scaffolder must never
// overwrite a human sentence.
//
// Fixture: the world-d base miniature (two continents, three named handles,
// one pre-existing authored bound record) plus the real name tables. The
// pre-existing record is deliberate — its FILE NAME predates the
// handle-derived naming rule, so the first run must reconcile it away and
// mint its replacement, which is exactly the re-seed story this tool exists for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldBound } from "../scaffold-civil.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function repoFixture() {
  const dir = mkdtempSync(join(tmpdir(), "scaffold-"));
  cpSync(join(ROOT, "scripts/tests/fixtures/world-d/base"), join(dir, "content"), { recursive: true });
  cpSync(join(ROOT, "content/world/names"), join(dir, "content/world/names"), { recursive: true });
  return dir;
}

const listBound = (dir) => readdirSync(join(dir, "content/world/civil/bound")).sort();

test("scaffoldBound mints one record per NAMED handle and none per unnamed", () => {
  const dir = repoFixture();
  const r = scaffoldBound({ repoRoot: dir, dryRun: false });
  assert.deepEqual(r.problems, []);
  // 3 named instances across the two fixture continents; h-77aa is named:false.
  // The fourth written byte-set is the drowned-stair reconciliation: its old
  // file name is deleted and its handle-derived replacement minted fresh.
  assert.equal(r.written.length, 3);
  assert.deepEqual(r.deleted, ["c-lm-the-drowned-stair.json"]);
  assert.equal(listBound(dir).length, 3);
});

test("every minted record validates and carries no coordinate key", () => {
  const dir = repoFixture();
  scaffoldBound({ repoRoot: dir, dryRun: false });
  for (const f of listBound(dir)) {
    const doc = JSON.parse(readFileSync(join(dir, "content/world/civil/bound", f), "utf8"));
    assert.equal(doc.tier, "bound");
    // THE handle grammar, and it is one string in three schemas: this one,
    // handle-ledger.schema.json and landform-instance.schema.json. 4-6 hex.
    assert.match(doc.bind.handle, /^c[0-9]{2}\/[a-z-]+\/h-[0-9a-f]{4,6}$/);
    assert.equal(doc.bind.expect.sizeKm.length, 2);
    assert.ok(doc.bind.expect.sizeKm[0] < doc.bind.expect.sizeKm[1]);
    assert.equal(JSON.stringify(doc).includes('"at"'), false);
  }
});

test("running it twice is a no-op (set reconciliation, not append)", () => {
  const dir = repoFixture();
  scaffoldBound({ repoRoot: dir, dryRun: false });
  const before = listBound(dir).map((f) => readFileSync(join(dir, "content/world/civil/bound", f), "utf8")).join("");
  const second = scaffoldBound({ repoRoot: dir, dryRun: false });
  const after = listBound(dir).map((f) => readFileSync(join(dir, "content/world/civil/bound", f), "utf8")).join("");
  assert.equal(after, before);
  assert.equal(second.written.length, 0);
  assert.equal(second.kept.length, 3);
});

test("a handle that leaves the ledger takes its record with it", () => {
  const dir = repoFixture();
  scaffoldBound({ repoRoot: dir, dryRun: false });
  const p = join(dir, "content/world/handles/continent-10.json");
  const ledger = JSON.parse(readFileSync(p, "utf8"));
  ledger.handles = [];
  writeFileSync(p, JSON.stringify(ledger, null, 2) + "\n");
  const r = scaffoldBound({ repoRoot: dir, dryRun: false });
  assert.equal(r.deleted.length, 1);
  assert.equal(listBound(dir).length, 2);
});

test("authored prose is NEVER overwritten, but the binding facts are refreshed", () => {
  const dir = repoFixture();
  scaffoldBound({ repoRoot: dir, dryRun: false });
  const files = listBound(dir);
  const p = join(dir, "content/world/civil/bound", files[0]);
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.prose = "authored";
  doc.title = "The Drowned Stair";
  doc.lore.note = "Cut steps run down the shaft wall and stop three fathoms under water.";
  doc.bind.expect.sizeKm = [99, 100]; // a stale fact the scaffolder must fix
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  scaffoldBound({ repoRoot: dir, dryRun: false });
  const after = JSON.parse(readFileSync(p, "utf8"));
  assert.equal(after.title, "The Drowned Stair");
  assert.match(after.lore.note, /^Cut steps run down/);
  assert.notDeepEqual(after.bind.expect.sizeKm, [99, 100]);
});

test("--dry-run writes nothing", () => {
  const dir = repoFixture();
  const before = listBound(dir);
  const r = scaffoldBound({ repoRoot: dir, dryRun: true });
  assert.equal(r.written.length, 3);
  assert.deepEqual(listBound(dir), before);
});

test("bandFor clamps above the lexicon ceiling and never emits an empty band", () => {
  // A measured size at or beyond the lexicon's own ceiling makes the naive
  // clamp emit lo >= hi — a band that gates nothing. The hi fallback
  // (double-the-floor) must take over.
  const dir = repoFixture();
  const p = join(dir, "content/world/handles/continent-02.json");
  const led = JSON.parse(readFileSync(p, "utf8"));
  led.handles.find((h) => h.handle === "c02/coastal/h-a1b2").sizeKm = 50; // lexicon ceiling is 8.0
  writeFileSync(p, JSON.stringify(led, null, 2) + "\n");
  scaffoldBound({ repoRoot: dir, dryRun: false });
  const doc = JSON.parse(readFileSync(join(dir, "content/world/civil/bound", "c-lm-c02-coastal-a1b2.json"), "utf8"));
  assert.equal(doc.bind.expect.sizeKm[0] < doc.bind.expect.sizeKm[1], true, JSON.stringify(doc.bind.expect.sizeKm));
});
