import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Town-criteria consistency gate — the machine half of the town-canon-reviewer's
// Pass 1/Pass 2. The criteria file (content/world/town-criteria.json) is owned by
// the reviewer; this test CONSUMES it as data and asserts the committed plan and
// brief against it. A criterion that fails here means the plan, the brief, or the
// criteria drifted — the fix is to whichever side is wrong, never to delete the
// assertion silently (canon.md §6 discipline).

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const criteria = read("content/world/town-criteria.json");
const plan = read(criteria.towns.millcross.plan);
const brief = read("tools/art-forge/briefs/A1-ART-02.json");

const byId = (rules, id) => rules.find((r) => r.id === id);
const multiset = (arr) => [...arr].sort((a, b) => a - b).join(",");

test("criteria integrity: every rule carries a source and a check — an unsourced criterion is decoration", () => {
  for (const rule of criteria.measured) {
    assert.ok(rule.source, `${rule.id} has no source`);
    assert.ok(rule.id, "measured rule missing id");
  }
  for (const rule of criteria.towns.millcross.ratified) {
    assert.ok(rule.source, `${rule.id} has no source`);
    assert.ok(rule.check, `${rule.id} has no check`);
  }
  for (const rule of criteria.realism) {
    assert.ok(rule.source, `${rule.id} has no source`);
  }
});

test("measured floors hold on the committed plan: cart >= 12, foot >= 4, footprint shorter side >= 6, extent in band", () => {
  for (const road of plan.roads) {
    const floor = byId(criteria.measured, `road-width-floor-${road.kind}`);
    if (!floor) continue;
    assert.ok(
      road.width >= floor.value,
      `${road.id}: width ${road.width} < ${road.kind} floor ${floor.value}`,
    );
  }
  for (const f of plan.footprints) {
    const [x0, y0, x1, y1] = f.rect;
    const shorter = Math.min(x1 - x0, y1 - y0);
    assert.ok(
      shorter >= byId(criteria.measured, "footprint-shorter-side").value,
      `${f.id}: shorter side ${shorter} below the floor`,
    );
  }
  const band = byId(criteria.measured, "extent-band").value;
  assert.ok(plan.extent.width >= band[0] && plan.extent.width <= band[1]);
  assert.ok(plan.extent.height >= band[0] && plan.extent.height <= band[1]);
});

test("ratified structural rules hold: wall-less, no tent, exactly one 2-storey (the mill)", () => {
  const kinds = plan.footprints.map((f) => f.kind);
  for (const banned of ["wall", "gate", "tent"]) {
    assert.equal(
      kinds.includes(banned),
      false,
      `kind "${banned}" reappeared in the plan — world truth drifted or the enum loosened`,
    );
  }
  const twoStorey = plan.footprints.filter((f) => (f.storeys ?? 1) >= 2);
  assert.equal(twoStorey.length, 1, "exactly one 2-storey mass is canon-forced");
  assert.equal(twoStorey[0].kind, "mill", "the 2-storey mass is the mill-house");
});

test("authored values are pinned: extent 220x160, road-width multisets per kind", () => {
  const extent = byId(criteria.towns.millcross.ratified, "extent");
  assert.deepEqual(plan.extent, extent.value);
  const widths = byId(criteria.towns.millcross.ratified, "road-widths-authored");
  for (const kind of Object.keys(widths.value)) {
    const got = multiset(plan.roads.filter((r) => r.kind === kind).map((r) => r.width));
    const want = multiset(widths.value[kind]);
    assert.equal(got, want, `road widths for ${kind} drifted — re-derive the criteria row if the plan change is deliberate`);
  }
});

test("brief count phrase matches the plan within the reviewer's band", () => {
  const band = criteria.towns.millcross.briefs.countBand;
  const phrase = Object.keys(band.phraseToNumber).find((p) => brief.prompt.includes(p));
  assert.ok(phrase, "brief prompt carries no count phrase — R4 would be blind");
  const declared = band.phraseToNumber[phrase];
  assert.ok(
    Math.abs(declared - plan.footprints.length) <= band.tolerance,
    `count phrase "${phrase}" (${declared}) vs ${plan.footprints.length} footprints exceeds ±${band.tolerance}`,
  );
});

test("brief prompt is clean against the reviewer's forbidden phrases and cliché vocabulary", () => {
  const phrases = criteria.towns.millcross.briefs.forbiddenPhrases.value;
  for (const phrase of phrases) {
    assert.equal(
      brief.prompt.includes(phrase),
      false,
      `forbidden phrase "${phrase}" in the brief prompt (planned-village register)`,
    );
  }
  const vocab = criteria.antiCliche.forbiddenVocabulary.value;
  for (const token of vocab) {
    assert.equal(
      brief.prompt.toLowerCase().includes(token.toLowerCase()),
      false,
      `cliché token "${token}" in the brief prompt`,
    );
  }
});

test("brief carries the ratified palette and the structural material register", () => {
  const palette = byId(criteria.towns.millcross.ratified, "palette").value;
  for (const word of palette) {
    assert.ok(
      brief.prompt.toLowerCase().includes(word.toLowerCase()),
      `palette word "${word}" missing from the brief prompt`,
    );
  }
  assert.ok(brief.prompt.includes("timber-framed"), "structural material register missing");
  assert.ok(brief.prompt.includes("stone footings"), "structural material register missing");
});

test("criteria's knownOpenItems stay open — nothing here silently closes a G5-class contradiction", () => {
  assert.ok(criteria.knownOpenItems.some((i) => i.id === "gate-quest-contradiction"));
});
