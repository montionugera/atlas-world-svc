import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanRetiredNames } from "../check_canon_names.mjs";
import { renderCanonCard } from "../canon_card.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const G = JSON.parse(readFileSync(join(ROOT, "content/studio/canon/glossary.json"), "utf8"));
const retired = G.retired_names;

function scratch(text) {
  const root = mkdtempSync(join(tmpdir(), "canon-"));
  mkdirSync(join(root, "content"), { recursive: true });
  writeFileSync(join(root, "content/a.md"), text);
  return root;
}

test("retired name in a file is reported (red proof)", () => {
  assert.deepEqual(scanRetiredNames(scratch("Lumi walks in."), { retired }), [{ file: "content/a.md", name: "Lumi" }]);
});

test("clean text gives no hits", () => {
  assert.deepEqual(scanRetiredNames(scratch("Isil walks in. Luma sleeps."), { retired }), []);
});

test("real repo is clean (green)", () => {
  assert.deepEqual(scanRetiredNames(ROOT, { retired }), []);
});

test("glossary npcs: six travellers, Isil is Silme, Lumi only retired", () => {
  const t = G.npcs.travellers;
  assert.equal(t.length, 6);
  assert.equal(t.find((n) => n.name === "Isil").race, "Silme Seers");
  assert.ok(retired.includes("Lumi"));
  assert.ok(!JSON.stringify({ ...G, retired_names: [] }).includes("Lumi"));
});

test("canon card renders from glossary", () => {
  const card = renderCanonCard(G);
  assert.match(card, /Isil/);
  assert.match(card, /Kilnwatch Wardens/);
  assert.ok(!card.includes("train as a Cala"));
});

test("glossary F-180: Maro Bell cast, renames, wardens", () => {
  const mb = G.npcs.town.maro_bell;
  assert.equal(mb.length, 6);
  assert.ok(mb.some((n) => n.name === "Tovin"));

  const renames = G.npcs.scar_renames;
  assert.ok(renames.some((r) => r.retired === "Mira" && r.name === "Lasse"));
  assert.ok(renames.some((r) => r.retired === "Thessa" && r.name === "Sarn"));

  assert.deepEqual(
    G.wardens.ranks.map((r) => r.name),
    ["Runner", "Warden", "Elder Warden"],
  );

  const quests = G.prologues.maro_bell.quests;
  assert.equal(quests.length, 8);
  assert.equal(quests.find((q) => q.id === "q-maro-04")?.flag, "first_trace");
  assert.equal(quests.find((q) => q.id === "q-maro-06")?.flag, "time_wound");

  assert.ok(G.retired_names.includes("Mira"));
  assert.ok(G.retired_names.includes("Thessa"));

  const card = renderCanonCard(G);
  assert.ok(card.includes("Elder Warden"));
  assert.ok(card.includes("The Great Bell"));
  assert.ok(card.includes("Oil Leech"));
});
