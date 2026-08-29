import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  zoneProseFields,
  censusAbsenceTrap,
  MARKER_RE,
  SCOPE_RE,
} from "../lib/absence-trap-census.mjs";

function writeZone(root, name, doc) {
  mkdirSync(join(root, "zones"), { recursive: true });
  writeFileSync(join(root, "zones", name), JSON.stringify(doc));
}

test("zoneProseFields counts reasonToGo + hazard/resource/landmark descriptions, NOT hazard.note", () => {
  const doc = {
    zone: "z", region: "c01/r01", survey: "surveyed",
    reasonToGo: "a",
    hazards: [{ id: "h1", name: "H", description: "b", note: "should not count" }],
    resources: [{ id: "r1", name: "R", kind: "stone", description: "c" }],
    landmarks: [{ id: "l1", name: "L", description: "d" }],
  };
  const fields = zoneProseFields(doc);
  assert.equal(fields.length, 4);
  assert.deepEqual(fields.map((f) => f.text), ["a", "b", "c", "d"]);
});

test("this reproduces the design's 294-prose-field count against the LIVE corpus at this sha", () => {
  // Not a synthetic fixture: this is the regression pin that proves the field
  // definition (reasonToGo + 3 description arrays, no hazards[].note) is the
  // one the design's number actually came from — excluding note undershoots
  // to exactly 294 where including it overshoots. If this ever moves, that is
  // real corpus growth/shrinkage, not a bug in the counter — report it, don't
  // "fix" the counter to get 294 back.
  const contentRoot = new URL("../../content", import.meta.url).pathname;
  const result = censusAbsenceTrap({ contentRoot });
  assert.equal(result.recordCount, 40);
  assert.equal(result.proseFieldCount, 294);
  assert.deepEqual(result.problems, []);
});

test("marker-only tier fires on a bare exclusivity/superlative/negative-existence sentence with no scope", () => {
  const root = mkdtempSync(join(tmpdir(), "census-"));
  writeZone(root, "zone-a.json", {
    zone: "a", region: "c01/r01", survey: "surveyed",
    reasonToGo: "It takes a boot first and then the leg.", // local "first", no exclusivity marker
    hazards: [{ id: "h", name: "H", description: "The only ford on this stretch floods without warning." }],
    resources: [], landmarks: [],
  });
  const result = censusAbsenceTrap({ contentRoot: root });
  assert.equal(result.tier1.records, 1);
  assert.equal(result.tier1.sentences, 1, "the local 'first' sentence must NOT trip tier 1");
  assert.equal(result.tier2.records, 0, "no scope phrase present — must not reach tier 2");
});

test("marker+scope tier requires BOTH a marker and an explicit whole-population scope phrase", () => {
  const root = mkdtempSync(join(tmpdir(), "census-"));
  writeZone(root, "zone-b.json", {
    zone: "b", region: "c01/r01", survey: "surveyed",
    reasonToGo: "It is the only lava tube drawn anywhere in the world.",
    hazards: [], resources: [], landmarks: [],
  });
  const result = censusAbsenceTrap({ contentRoot: root });
  assert.equal(result.tier1.records, 1);
  assert.equal(result.tier2.records, 1);
  assert.equal(result.tier2.sentences, 1);
  assert.equal(result.tier2.sentencesWithNumber, 0);
});

test("a tripped sentence with a literal digit is counted separately from ones without", () => {
  const root = mkdtempSync(join(tmpdir(), "census-"));
  writeZone(root, "zone-c.json", {
    zone: "c", region: "c01/r01", survey: "surveyed",
    reasonToGo: "It is the only ground in the world that carries 43.9 percent bramble.",
    hazards: [], resources: [], landmarks: [],
  });
  const result = censusAbsenceTrap({ contentRoot: root });
  assert.equal(result.tier2.sentences, 1);
  assert.equal(result.tier2.sentencesWithNumber, 1);
});

test("MUTATION PROOF: a plain sentence with none of the marker vocabulary does not trip either tier", () => {
  const root = mkdtempSync(join(tmpdir(), "census-"));
  writeZone(root, "zone-d.json", {
    zone: "d", region: "c01/r01", survey: "surveyed",
    reasonToGo: "Wheat grows on the terrace and the road runs past it.",
    hazards: [], resources: [], landmarks: [],
  });
  const result = censusAbsenceTrap({ contentRoot: root });
  assert.equal(result.tier1.records, 0);
  assert.equal(result.tier1.sentences, 0);
  assert.equal(result.tier2.records, 0);
  // Watched-red proof that MARKER_RE/SCOPE_RE can fail at all (a rule that
  // cannot fail is the defect this programme keeps finding): a sentence
  // built to obviously trip both must actually trip both.
  assert.ok(MARKER_RE.test("the only ground in the world"));
  assert.ok(SCOPE_RE.test("the only ground in the world"));
  assert.ok(!MARKER_RE.test("Wheat grows on the terrace and the road runs past it."));
});

test("an unreadable zone file is named as a problem and does not throw", () => {
  const root = mkdtempSync(join(tmpdir(), "census-"));
  mkdirSync(join(root, "zones"), { recursive: true });
  writeFileSync(join(root, "zones", "zone-broken.json"), "{ not json");
  const result = censusAbsenceTrap({ contentRoot: root });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /zone-broken\.json is unreadable or invalid JSON/);
});
