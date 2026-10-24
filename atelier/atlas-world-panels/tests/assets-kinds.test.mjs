// Kind ids for ?tab=assets&kind=… (js/data/taxonomy.mjs): a section id, or a section
// narrowed to one manifest-key prefix. Real manifest + taxonomy, not fixtures, so the
// documented deep links (kind=character:mob) can't rot silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_KIND,
  buildKindIndex,
  filterByKind,
  keyPrefix,
  loadTaxonomy,
} from "../js/data/taxonomy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const taxonomy = loadTaxonomy(read("content/asset-taxonomy.json"));
const entries = [
  ...Object.entries(read("game-client/assets/manifest.json").entries),
  ...Object.entries(read("game-client/assets/catalog-manifest.json").entries),
];

test("keyPrefix: first segment, whole key when there is no colon", () => {
  assert.equal(keyPrefix("mob:aggressive"), "mob");
  assert.equal(keyPrefix("player"), "player");
  assert.equal(keyPrefix("a:b:c"), "a");
});

test("ALL_KIND and empty match every entry", () => {
  assert.equal(
    filterByKind(entries, ALL_KIND, taxonomy).length,
    entries.length,
  );
  assert.equal(filterByKind(entries, "", taxonomy).length, entries.length);
});

test("a section id selects exactly that section", () => {
  const got = filterByKind(entries, "creature", taxonomy);
  assert.ok(got.length > 0);
  assert.ok(got.every(([, e]) => e.kind === "creature"));
});

test("section:prefix narrows to the key prefix — character:mob is the mob:* entries", () => {
  const got = filterByKind(entries, "character:mob", taxonomy);
  assert.ok(got.length > 0);
  assert.ok(
    got.every(([k, e]) => k.startsWith("mob:") && e.kind === "character"),
  );
  const all = entries.filter(
    ([k, e]) => k.startsWith("mob:") && e.kind === "character",
  );
  assert.equal(got.length, all.length);
});

test("an unknown kind matches nothing (never silently widens to All)", () => {
  assert.equal(filterByKind(entries, "vfx:spell", taxonomy).length, 0);
  assert.equal(filterByKind(entries, "nonsense", taxonomy).length, 0);
});

test("buildKindIndex: counts add up and every child id round-trips through filterByKind", () => {
  const index = buildKindIndex(entries, taxonomy);
  assert.equal(
    index.reduce((n, k) => n + k.count, 0),
    entries.length,
    "every entry is in exactly one section",
  );
  for (const section of index) {
    assert.equal(
      section.children.reduce((n, c) => n + c.count, 0),
      section.count,
    );
    assert.equal(
      filterByKind(entries, section.id, taxonomy).length,
      section.count,
    );
    for (const child of section.children) {
      assert.equal(
        filterByKind(entries, child.id, taxonomy).length,
        child.count,
        child.id,
      );
    }
  }
});

test("buildKindIndex: a section with no entries is dropped", () => {
  const index = buildKindIndex([entries[0]], taxonomy);
  assert.equal(index.length, 1);
});
