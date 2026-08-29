#!/usr/bin/env node
// scripts/report_relation_coverage.mjs — how much of the prose's n-ary claim
// surface the relation layer actually models.
//
// ALWAYS EXITS 0. This is a REPORT, not a gate: a coverage floor that fails
// the build would be gamed by writing thin relations, and the number is
// useful precisely because it is allowed to be uncomfortable. The floor lives
// in content/world/manifest.json as `relations.coverageFloorPct` and the
// report says LOW when it is missed, so the debt is visible on every run.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORY = ["canon.md", "lore.json", "quests.json", "dialogue.json",
               "events.json", "arcs.json", "regions.json", "bible.md"];

// The six claim classes and the design's own grep vocabulary (§4.1). These
// patterns are the MEASUREMENT — changing one changes the denominator, so
// they are committed here and never tuned to make a number look better.
const CLASSES = [
  { id: "network",   re: /\b(road|route|lane|spur|crossroads?|ford|port|harbour|gate)\b/gi },
  { id: "unique",    re: /\b(only|sole|nearest|largest|first|last)\b/gi },
  { id: "bearing",   re: /\b(north|south|east|west|north-?east|north-?west|south-?east|south-?west)\b/gi },
  { id: "distance",  re: /\b\d+\s?(km|kilometres?|miles?|days?['\u2019]? (?:walk|ride|sail))\b/gi },
  { id: "colocated", re: /\b(beneath it|at the mouth|borders the|sits on|stands over)\b/gi },
  { id: "between",   re: /\b(hub|between|passes through|midway)\b/gi },
];
// Which relation `rel` values model which class.
const MODELS = {
  network: ["connected_by_road", "not_connected_by_road"],
  unique: ["unique_in_scope"],
  bearing: ["bearing"],
  distance: ["distance"],
  colocated: ["colocated_with"],
  between: ["betweenness", "adjacency"],
};

const storyText = STORY
  .map((f) => join(ROOT, "content/story", f))
  .filter(existsSync)
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");

const found = Object.fromEntries(CLASSES.map(({ id, re }) =>
  [id, (storyText.match(re) ?? []).length]));

const relDir = join(ROOT, "content/world/relations");
const relations = existsSync(relDir)
  ? readdirSync(relDir).filter((f) => f.endsWith(".json")).sort()
      .flatMap((f) => JSON.parse(readFileSync(join(relDir, f), "utf8")))
  : [];
const modelled = Object.fromEntries(Object.entries(MODELS).map(([cls, rels]) =>
  [cls, relations.filter((r) => rels.includes(r.rel)).length]));

const manifest = existsSync(join(ROOT, "content/world/manifest.json"))
  ? JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8")) : {};
const floor = manifest.relations?.coverageFloorPct ?? null;

let totalFound = 0, totalModelled = 0;
for (const { id } of CLASSES) {
  totalFound += found[id];
  totalModelled += modelled[id];
  console.log(`relation-coverage: ${id} ${modelled[id]}/${found[id]}`);
}
const pct = totalFound === 0 ? 100 : Math.round((totalModelled / totalFound) * 1000) / 10;
console.log(`relation-coverage: TOTAL ${totalModelled}/${totalFound} (${pct}%)`);
if (floor !== null)
  console.log(`relation-coverage: floor ${floor}% — ${pct >= floor ? "MET" : "LOW"}`);
console.log(`relation-coverage: ${relations.length} relations across ${
  existsSync(relDir) ? readdirSync(relDir).filter((f) => f.endsWith(".json")).length : 0} files`);
