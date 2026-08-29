import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkAmendedPending,
  checkTowerRelayAssertions,
  checkLegacyLandmarkCitations,
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

// --- the live corpus (the assertions this task must turn green) ---------

test("the live corpus carries zero AMENDED-PENDING markers", () => {
  const out = checkAmendedPending({ repoRoot: ROOT });
  assert.deepEqual(out, [], `G-AMENDED failures in the live corpus:\n${out.join("\n")}`);
});

test("the live corpus's content/story/*.json carries zero tower/relay assertions", () => {
  const out = checkTowerRelayAssertions({ repoRoot: ROOT });
  assert.deepEqual(out, [], `G-TOWER-RELAY failures in the live corpus:\n${out.join("\n")}`);
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
