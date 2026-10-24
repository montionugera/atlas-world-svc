// Pure half of view/FilterBar.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesFilter, tagGroupsFor } from "../js/view/FilterBar.mjs";

const entry = {
  scene: "res://assets/characters/4gtn.glb",
  kind: "character",
  tier: "seed",
  license: "CC0",
  source: "market",
};

test("empty filter matches", () => {
  assert.equal(matchesFilter("mob:aggressive", entry, {}), true);
  assert.equal(
    matchesFilter("mob:aggressive", entry, { text: "  ", tags: {} }),
    true,
  );
});

test("text matches key, file name and fields, case-insensitively, all terms required", () => {
  assert.equal(
    matchesFilter("mob:aggressive", entry, { text: "AGGRESS" }),
    true,
  );
  assert.equal(matchesFilter("mob:aggressive", entry, { text: "4gtn" }), true);
  assert.equal(
    matchesFilter("mob:aggressive", entry, { text: "seed cc0" }),
    true,
  );
  assert.equal(
    matchesFilter("mob:aggressive", entry, { text: "mob zzz" }),
    false,
  );
});

test("the scene directory is not searchable noise — only the file name", () => {
  assert.equal(matchesFilter("k", entry, { text: "characters" }), false); // dir of 4gtn.glb
  assert.equal(
    matchesFilter("k", { scene: "res://assets/zzz/a.glb" }, { text: "zzz" }),
    false,
  );
});

test("a tag must equal the entry field; null clears it", () => {
  assert.equal(matchesFilter("k", entry, { tags: { tier: "seed" } }), true);
  assert.equal(matchesFilter("k", entry, { tags: { tier: "bespoke" } }), false);
  assert.equal(matchesFilter("k", entry, { tags: { tier: null } }), true);
});

test("tagGroupsFor drops single-valued groups (a chip row that filters nothing)", () => {
  const groups = tagGroupsFor([
    ["a", { tier: "seed", license: "CC0" }],
    ["b", { tier: "bespoke", license: "CC0" }],
    ["c", { tier: "seed", license: "CC0" }],
  ]);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["tier"],
  );
  assert.deepEqual(groups[0].values, [
    ["seed", 2],
    ["bespoke", 1],
  ]);
});
