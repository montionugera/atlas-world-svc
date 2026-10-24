// W2-D — the Review panel's verdict filters (js/review/verdict-filter.mjs).
// Pure: the store lookup is injected, no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VERDICT_FILTERS,
  filterByVerdict,
  matchesVerdict,
  normalizeVerdictFilter,
  verdictCounts,
} from "../js/review/verdict-filter.mjs";

const entries = [
  ["mob:a", {}],
  ["mob:b", {}],
  ["mob:c", {}],
  ["mob:d", {}],
];
const marks = {
  "mob:a": { verdict: "reject", note: "n" },
  "mob:b": { verdict: "rebuild", note: "n" },
  "mob:c": { verdict: "rebuild", note: "n" },
};
const lookup = (k) => marks[k] || null;

test("the filter ids are exactly the URL vocabulary", () => {
  assert.deepEqual(
    VERDICT_FILTERS.map((f) => f.id),
    ["all", "reject", "rebuild", "unreviewed"],
  );
});

test("normalizeVerdictFilter: absent means all, unknown falls back to all but says so", () => {
  assert.deepEqual(normalizeVerdictFilter(undefined), {
    id: "all",
    known: true,
  });
  assert.deepEqual(normalizeVerdictFilter(""), { id: "all", known: true });
  assert.deepEqual(normalizeVerdictFilter("reject"), {
    id: "reject",
    known: true,
  });
  assert.deepEqual(normalizeVerdictFilter("unreviewed"), {
    id: "unreviewed",
    known: true,
  });
  assert.deepEqual(normalizeVerdictFilter("bogus"), {
    id: "all",
    known: false,
  });
});

test("matchesVerdict partitions marked and unmarked assets", () => {
  assert.equal(matchesVerdict("reject", marks["mob:a"]), true);
  assert.equal(matchesVerdict("reject", marks["mob:b"]), false);
  assert.equal(matchesVerdict("rebuild", marks["mob:b"]), true);
  assert.equal(matchesVerdict("unreviewed", null), true);
  assert.equal(matchesVerdict("unreviewed", marks["mob:a"]), false);
  assert.equal(matchesVerdict("all", null), true);
});

test("filterByVerdict keeps entry order and the all filter returns the same list", () => {
  assert.equal(filterByVerdict(entries, "all", lookup), entries);
  assert.deepEqual(
    filterByVerdict(entries, "rebuild", lookup).map(([k]) => k),
    ["mob:b", "mob:c"],
  );
  assert.deepEqual(
    filterByVerdict(entries, "unreviewed", lookup).map(([k]) => k),
    ["mob:d"],
  );
});

test("verdictCounts: reject + rebuild + unreviewed always sum to all", () => {
  const c = verdictCounts(entries, lookup);
  assert.deepEqual(c, { all: 4, reject: 1, rebuild: 2, unreviewed: 1 });
  assert.equal(c.reject + c.rebuild + c.unreviewed, c.all);
});

test("verdictCounts on an empty library is all zeros, not NaN", () => {
  assert.deepEqual(verdictCounts([], lookup), {
    all: 0,
    reject: 0,
    rebuild: 0,
    unreviewed: 0,
  });
});
