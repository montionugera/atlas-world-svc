// F-038 Task 1 — the section-naming registry.
//
// Before this module, tools/asset-storybook/js/sidebar.mjs carried a
// hand-maintained RENDER_LABELS lookup and fell through to a generic
// capitalize-and-append-s branch on a miss. That is how the largest section
// in the tool came to be labelled "Model3d:dungeons (283)" — a silent lookup
// miss, not an error. These tests pin the replacement: labels come from
// content/asset-taxonomy.json, and an unregistered kind lands in an explicit
// __untaxonomized bucket that guard (H) fails the build on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadTaxonomy,
  sectionForEntry,
  labelForSection,
  groupEntries,
  UNTAXONOMIZED,
} from "../js/data/taxonomy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const FIXTURE = {
  version: 1,
  sections: [
    { id: "dungeon", label: "Dungeon Kit", order: 60, kinds: ["dungeon"] },
    { id: "character", label: "Characters", order: 10, kinds: ["character"] },
  ],
};

test("resolves a kind to its section", () => {
  const t = loadTaxonomy(FIXTURE);
  assert.equal(sectionForEntry({ kind: "dungeon" }, t), "dungeon");
  assert.equal(sectionForEntry({ kind: "character" }, t), "character");
});

test("labels come from the registry, never from string munging", () => {
  const t = loadTaxonomy(FIXTURE);
  assert.equal(labelForSection("dungeon", t), "Dungeon Kit");
  // The regression this whole module exists to prevent.
  assert.notEqual(labelForSection("dungeon", t), "Model3d:dungeons");
});

test("an unregistered kind lands in __untaxonomized, not a munged label", () => {
  const t = loadTaxonomy(FIXTURE);
  assert.equal(sectionForEntry({ kind: "sasquatch" }, t), UNTAXONOMIZED);
  assert.equal(labelForSection(UNTAXONOMIZED, t), "Untaxonomized");
});

test("an entry with no kind is untaxonomized rather than throwing", () => {
  const t = loadTaxonomy(FIXTURE);
  assert.equal(sectionForEntry({}, t), UNTAXONOMIZED);
  assert.equal(sectionForEntry(null, t), UNTAXONOMIZED);
});

test("groupEntries returns sections in registry order, not insertion order", () => {
  const t = loadTaxonomy(FIXTURE);
  const grouped = groupEntries(
    [
      ["d1", { kind: "dungeon" }],
      ["c1", { kind: "character" }],
      ["d2", { kind: "dungeon" }],
    ],
    t,
  );
  // character has order 10, dungeon 60 — despite dungeon being seen first.
  assert.deepEqual([...grouped.keys()], ["character", "dungeon"]);
  assert.equal(grouped.get("dungeon").length, 2);
  assert.equal(grouped.get("character").length, 1);
});

test("groupEntries drops empty sections so the sidebar shows no dead items", () => {
  const t = loadTaxonomy(FIXTURE);
  const grouped = groupEntries([["c1", { kind: "character" }]], t);
  assert.deepEqual([...grouped.keys()], ["character"]);
});

test("the real registry covers every kind in the real manifests", () => {
  const taxonomy = JSON.parse(
    readFileSync(join(ROOT, "content/asset-taxonomy.json"), "utf8"),
  );
  const known = new Set();
  for (const s of taxonomy.sections) for (const k of s.kinds) known.add(k);

  const sources = [
    "game-client/assets/manifest.json",
    "game-client/assets/catalog-manifest.json",
  ];
  const missing = new Set();
  for (const rel of sources) {
    const entries = JSON.parse(readFileSync(join(ROOT, rel), "utf8")).entries;
    for (const entry of Object.values(entries)) {
      if (entry.kind && !known.has(entry.kind)) missing.add(entry.kind);
    }
  }
  assert.deepEqual(
    [...missing],
    [],
    "kinds present in a manifest but absent from content/asset-taxonomy.json",
  );
});
