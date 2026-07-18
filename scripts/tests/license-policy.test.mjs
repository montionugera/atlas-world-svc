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

test("CC-BY-3.0 with author+source passes", () => {
  assert.deepEqual(
    run({ license: "CC-BY-3.0", source: "market", author: "Quaternius" }),
    [],
  );
});

test("CC-BY-3.0 missing author fails", () => {
  const f = run({ license: "CC-BY-3.0", source: "market" });
  assert.equal(f.length, 1);
  assert.match(f[0], /CC-BY requires non-empty "author"/);
});

test("CC-BY-SA and CC-BY-NC remain hard failures", () => {
  for (const lic of ["CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC-BY-SA-3.0"]) {
    const f = run({ license: lic, source: "s", author: "a" });
    assert.equal(f.length, 1, `expected failure for ${lic}`);
    assert.match(f[0], /not allowed/);
  }
});

test("empty license is left to the require-check (no policy error)", () => {
  assert.deepEqual(run({}), []);
});

test("non-string license fails loudly instead of silently passing", () => {
  for (const bad of [123, true, ["CC0"], { license: "CC0" }]) {
    const f = run({ license: bad });
    assert.equal(f.length, 1, `expected exactly one failure for ${JSON.stringify(bad)}`);
    assert.match(f[0], /license must be a string/);
  }
});
