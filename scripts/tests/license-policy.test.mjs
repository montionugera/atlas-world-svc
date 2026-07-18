import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLicensePolicy } from "../lib/license-policy.mjs";

const run = (entry) => {
  const failures = [];
  checkLicensePolicy("x", entry, failures);
  return failures;
};

test("CC0 entry passes with no source/author", () => {
  assert.deepEqual(run({ license: "CC0" }), []);
});

test("unknown license fails", () => {
  const f = run({ license: "CC-BY-SA-4.0", source: "s", author: "a" });
  assert.equal(f.length, 1);
  assert.match(f[0], /not allowed/);
});

test("CC-BY missing author fails", () => {
  const f = run({ license: "CC-BY-4.0", source: "OpenGameArt" });
  assert.equal(f.length, 1);
  assert.match(f[0], /CC-BY requires non-empty "author"/);
});

test("CC-BY missing source fails", () => {
  const f = run({ license: "CC-BY-4.0", author: "Composer" });
  assert.equal(f.length, 1);
  assert.match(f[0], /CC-BY requires non-empty "source"/);
});

test("CC-BY with author+source passes", () => {
  assert.deepEqual(
    run({ license: "CC-BY-4.0", source: "OpenGameArt", author: "Composer" }),
    [],
  );
});

test("empty license is left to the require-check (no policy error)", () => {
  assert.deepEqual(run({}), []);
});
