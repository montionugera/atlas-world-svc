import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkAmendedPending,
  checkTowerRelayAssertions,
  checkRetiredTowerPhrases,
  checkLegacyLandmarkCitations,
  amendedFiles,
  towerRelayFiles,
  retiredPhraseFiles,
} from "../lib/prose-audit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function scratch(files) {
  const dir = mkdtempSync(join(tmpdir(), "prose-audit-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body, "utf8");
  }
  return dir;
}

// --- checkAmendedPending -----------------------------------------------

test("G-AMENDED fails a line carrying the marker, with the line number", () => {
  const dir = scratch({
    "content/story/canon.md": "line one\n**AMENDED-PENDING (I-095): stale.**\nline three\n",
  });
  const out = checkAmendedPending({ repoRoot: dir, files: ["content/story/canon.md"] });
  assert.deepEqual(out, [
    "G-AMENDED: content/story/canon.md:2 still carries an AMENDED-PENDING marker — re-voice it",
  ]);
});

test("G-AMENDED passes a file with no marker", () => {
  const dir = scratch({ "content/story/canon.md": "nothing stale here\n" });
  assert.deepEqual(
    checkAmendedPending({ repoRoot: dir, files: ["content/story/canon.md"] }),
    [],
  );
});

// --- checkTowerRelayAssertions -------------------------------------------

test("G-TOWER-RELAY fails a JSON line naming a tower or a relay, case-insensitively", () => {
  const dir = scratch({
    "content/story/lore.json": '[{\n  "body": "Bellfaith Relay towers strung along the ridgelines"\n}]\n',
  });
  const out = checkTowerRelayAssertions({ repoRoot: dir, files: ["content/story/lore.json"] });
  assert.equal(out.length, 1);
  assert.match(out[0], /^G-TOWER-RELAY: content\/story\/lore\.json:2 /);
});

test("G-TOWER-RELAY passes a corpus with neither word", () => {
  const dir = scratch({ "content/story/lore.json": '[{"body": "the bell rings"}]\n' });
  assert.deepEqual(
    checkTowerRelayAssertions({ repoRoot: dir, files: ["content/story/lore.json"] }),
    [],
  );
});

// --- checkRetiredTowerPhrases --------------------------------------------

test("G-RETIRED-CLAIMS fails a line carrying one of the retired phrases, case-insensitively", () => {
  const dir = scratch({
    "docs/worldbuilding/A9.md": "This map is drawn as a Bellfaith Relay Map of the coast.\n",
  });
  const out = checkRetiredTowerPhrases({ repoRoot: dir, files: ["docs/worldbuilding/A9.md"] });
  assert.deepEqual(out, [
    'G-RETIRED-CLAIMS: docs/worldbuilding/A9.md:1 still says "bellfaith relay map" — retired with the redraw\'s zero tower nodes',
  ]);
});

test("G-RETIRED-CLAIMS passes legitimate per-town belfry prose the redraw did not retire", () => {
  const dir = scratch({
    "docs/worldbuilding/A9.md": "The mirror tower catches the sun; a single tolling tower rings assembly.\n",
  });
  assert.deepEqual(
    checkRetiredTowerPhrases({ repoRoot: dir, files: ["docs/worldbuilding/A9.md"] }),
    [],
  );
});

test("G-RETIRED-CLAIMS passes a historical quote of the retired six-towns claim, deliberately not on the phrase list", () => {
  const dir = scratch({
    "docs/worldbuilding/A9.md": "A0 flagged that a relay chain \"reaching six towns in hours\" would need a tower count.\n",
  });
  assert.deepEqual(
    checkRetiredTowerPhrases({ repoRoot: dir, files: ["docs/worldbuilding/A9.md"] }),
    [],
  );
});

// --- checkLegacyLandmarkCitations ----------------------------------------

test("G-LM-CITE fails a citation to a file that does not exist", () => {
  const dir = scratch({
    "content/zones/zone-thornveil.json": JSON.stringify({
      zone: "thornveil",
      landmarks: [{ id: "the-heartwood", name: "The heartwood", source: "content/maps/gone.json" }],
    }),
  });
  const out = checkLegacyLandmarkCitations({
    repoRoot: dir, contentRoot: join(dir, "content"), legacyZones: ["thornveil"],
  });
  assert.deepEqual(out, [
    'G-LM-CITE: zones/zone-thornveil.json landmark "the-heartwood" cites "content/maps/gone.json", which does not exist',
  ]);
});

test("G-LM-CITE fails a citation to a real file that does not carry the name", () => {
  const dir = scratch({
    "content/zones/zone-thornveil.json": JSON.stringify({
      zone: "thornveil",
      landmarks: [{ id: "the-heartwood", name: "The heartwood", source: "docs/worldbuilding/A9.md" }],
    }),
    "docs/worldbuilding/A9.md": "This document never mentions the missing feature at all.\n",
  });
  const out = checkLegacyLandmarkCitations({
    repoRoot: dir, contentRoot: join(dir, "content"), legacyZones: ["thornveil"],
  });
  assert.deepEqual(out, [
    'G-LM-CITE: zones/zone-thornveil.json landmark "the-heartwood" ("The heartwood") cites "docs/worldbuilding/A9.md", which does not carry the name',
  ]);
});

test("G-LM-CITE fails a citation whose file carries the words separately but not the name as a phrase", () => {
  const dir = scratch({
    "content/zones/zone-thornveil.json": JSON.stringify({
      zone: "thornveil",
      landmarks: [{ id: "the-rook-flats", name: "The rook flats", source: "docs/worldbuilding/A9.md" }],
    }),
    "docs/worldbuilding/A9.md": "Thousands of rooks working the flats at low water.\n",
  });
  const out = checkLegacyLandmarkCitations({
    repoRoot: dir, contentRoot: join(dir, "content"), legacyZones: ["thornveil"],
  });
  assert.deepEqual(out, [
    'G-LM-CITE: zones/zone-thornveil.json landmark "the-rook-flats" ("The rook flats") cites "docs/worldbuilding/A9.md", which does not carry the name',
  ]);
});

test("G-LM-CITE passes a citation whose file carries the whole name verbatim", () => {
  const dir = scratch({
    "content/zones/zone-thornveil.json": JSON.stringify({
      zone: "thornveil",
      landmarks: [{ id: "the-rook-flats", name: "The rook flats", source: "docs/worldbuilding/A9.md" }],
    }),
    "docs/worldbuilding/A9.md": "Thousands of rooks working the rook flats at low water.\n",
  });
  assert.deepEqual(
    checkLegacyLandmarkCitations({
      repoRoot: dir, contentRoot: join(dir, "content"), legacyZones: ["thornveil"],
    }),
    [],
  );
});

test("G-LM-CITE ignores a zone not in the legacy set", () => {
  const dir = scratch({
    "content/zones/zone-minted.json": JSON.stringify({
      zone: "minted",
      landmarks: [{ id: "the-x", name: "The x", source: "content/maps/gone.json" }],
    }),
  });
  assert.deepEqual(
    checkLegacyLandmarkCitations({
      repoRoot: dir, contentRoot: join(dir, "content"), legacyZones: ["thornveil"],
    }),
    [],
  );
});

// --- the non-empty-sweep floor (review finding I2, the tenth "rule that
// cannot fail" class this week: a directory-walk returning [] is a vacuous
// green, indistinguishable in the assertion below from a genuinely clean
// corpus). Proven on a real empty-sweep scenario, not asserted in the
// abstract: point both sweeps at a scratch root with neither content/ nor
// docs/worldbuilding/, watch the floor red, THEN show it is the floor —
// not the zero-problems check — doing the catching (checkAmendedPending and
// checkTowerRelayAssertions both correctly return [] on that same root,
// because an absent directory has no markers and no tower/relay words
// either; only the floor knows the difference between "swept and clean" and
// "never swept"). ---------------------------------------------------------

function assertSweepFloor(count, label) {
  // The EXACT predicate the live-corpus tests below run for real. Extracted
  // so the mutation tests and the real floor are provably the same check,
  // not two hand-written assertions that could quietly drift apart.
  assert.ok(count > 0, `${label} swept zero files`);
}

test("MUTATION: an empty sweep is reachable (no content/, no docs/worldbuilding/), and it is vacuously green without the floor", () => {
  const dir = scratch({ "unrelated/file.txt": "nothing here" });
  const files = amendedFiles({ repoRoot: dir });
  assert.deepEqual(files, [], "the scenario must actually produce an empty sweep to prove anything");
  // Without a floor, this is exactly what a vacuous green looks like: zero
  // problems, because there was nothing to check — checkAmendedPending itself
  // cannot tell "swept and clean" from "never swept".
  assert.deepEqual(checkAmendedPending({ repoRoot: dir, files }), []);
  // The floor is what turns "nothing to check" into a failure instead of a
  // silent pass.
  assert.throws(() => assertSweepFloor(files.length, "G-AMENDED"));
});

test("MUTATION: towerRelayFiles on a root with no content/story/ is also an empty, vacuously-green sweep — same floor, same catch", () => {
  const dir = scratch({ "unrelated/file.txt": "nothing here" });
  const files = towerRelayFiles({ repoRoot: dir });
  assert.deepEqual(files, []);
  assert.deepEqual(checkTowerRelayAssertions({ repoRoot: dir, files }), []);
  assert.throws(() => assertSweepFloor(files.length, "G-TOWER-RELAY"));
});

test("MUTATION: retiredPhraseFiles (G-RETIRED-CLAIMS) is the same sweep as G-AMENDED and is empty on the same empty root", () => {
  const dir = scratch({ "unrelated/file.txt": "nothing here" });
  const files = retiredPhraseFiles({ repoRoot: dir });
  assert.deepEqual(files, []);
  assert.deepEqual(checkRetiredTowerPhrases({ repoRoot: dir, files }), []);
  assert.throws(() => assertSweepFloor(files.length, "G-RETIRED-CLAIMS"));
});

test("the live corpus carries zero AMENDED-PENDING markers", () => {
  const files = amendedFiles({ repoRoot: ROOT });
  // The floor: a real sweep of content/ + docs/worldbuilding/ is hundreds of
  // files. 100 is comfortably below the true count (692 measured) and
  // comfortably above zero — it cannot pass on an empty or near-empty sweep,
  // and it will not need touching as ordinary content grows.
  assertSweepFloor(files.length, "G-AMENDED");
  assert.ok(files.length > 100, `G-AMENDED's sweep found only ${files.length} files — content/ or docs/worldbuilding/ may be missing`);
  const out = checkAmendedPending({ repoRoot: ROOT, files });
  assert.deepEqual(out, [], `G-AMENDED failures in the live corpus:\n${out.join("\n")}`);
});

test("the live corpus's content/story/*.json carries zero tower/relay assertions", () => {
  const files = towerRelayFiles({ repoRoot: ROOT });
  // Pinned as a NUMBER, same discipline as zone-content.test.mjs's citation
  // debt counter: content/story/ holds exactly 9 *.json files today. Growing
  // is a normal content addition (bump the number); zero is the vacuous-sweep
  // defect this floor exists to catch.
  assert.equal(files.length, 9, "content/story/*.json's file count moved — update this floor with it");
  const out = checkTowerRelayAssertions({ repoRoot: ROOT, files });
  assert.deepEqual(out, [], `G-TOWER-RELAY failures in the live corpus:\n${out.join("\n")}`);
});

test("the live corpus carries zero retired tower/relay CLAIMS (corpus-wide: content/ + docs/worldbuilding/)", () => {
  const files = retiredPhraseFiles({ repoRoot: ROOT });
  assertSweepFloor(files.length, "G-RETIRED-CLAIMS");
  assert.ok(files.length > 100, `G-RETIRED-CLAIMS's sweep found only ${files.length} files — content/ or docs/worldbuilding/ may be missing`);
  const out = checkRetiredTowerPhrases({ repoRoot: ROOT, files });
  assert.deepEqual(out, [], `G-RETIRED-CLAIMS failures in the live corpus:\n${out.join("\n")}`);
});

test("the live corpus's legacy ten cite documents that carry their landmark names", async () => {
  const { legacyPlaceholderRecords } = await import("../lib/zone-allocation.mjs");
  const legacyZones = legacyPlaceholderRecords({ root: ROOT }).map((r) => r.zone);
  assert.equal(legacyZones.length, 10, "expected exactly the legacy ten");
  const out = checkLegacyLandmarkCitations({
    repoRoot: ROOT, contentRoot: join(ROOT, "content"), legacyZones,
  });
  assert.deepEqual(out, [], `G-LM-CITE failures in the live corpus:\n${out.join("\n")}`);
});
