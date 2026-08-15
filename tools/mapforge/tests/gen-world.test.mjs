// tools/mapforge/tests/gen-world.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = join(ROOT, "tools/mapforge/gen-world.mjs");

function run(outDir) {
  return execFileSync(process.execPath, [CLI, "--out", outDir], { encoding: "utf8" });
}

test("gen-world: two runs are byte-identical (AC 1)", () => {
  const a = mkdtempSync(join(tmpdir(), "genw-a-")), b = mkdtempSync(join(tmpdir(), "genw-b-"));
  try {
    run(a); run(b);
    const fa = readdirSync(a).sort(), fb = readdirSync(b).sort();
    assert.deepEqual(fa, fb);
    for (const f of fa) assert.equal(readFileSync(join(a, f), "utf8"), readFileSync(join(b, f), "utf8"), f);
    assert.ok(fa.length >= 8, `only ${fa.length} files`);
    assert.ok(fa.includes("edges-addition.json"));
  } finally { rmSync(a, { recursive: true }); rmSync(b, { recursive: true }); }
});

test("gen-world: candidates pass the spine gate standalone (AC 1)", () => {
  const out = mkdtempSync(join(tmpdir(), "genw-gate-"));
  try {
    const stdout = run(out);
    assert.match(stdout, /gen-world: composition rollup ocean=9[4-8]/);
    assert.match(stdout, /gen-world: OK/);
  } finally { rmSync(out, { recursive: true }); }
});
