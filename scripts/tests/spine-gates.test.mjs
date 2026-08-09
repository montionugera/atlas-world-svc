import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpine, TIER_DEPTH } from "../lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const FIXTURES = join(ROOT, "scripts/tests/fixtures/spine");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "content/schemas/spine-node.schema.json"), "utf8"));

// Build a disposable content root from a committed fixture's spine/ plus the
// REAL schema (the schema under test is the shipped one, never a copy that
// can drift).
export function contentRootFor(fixture) {
  const dir = mkdtempSync(join(tmpdir(), "spine-gate-"));
  mkdirSync(join(dir, "schemas"), { recursive: true });
  cpSync(join(ROOT, "content/schemas/spine-node.schema.json"), join(dir, "schemas/spine-node.schema.json"));
  cpSync(join(FIXTURES, fixture, "spine"), join(dir, "spine"), { recursive: true });
  return dir;
}

export function runGate(contentRoot) {
  try {
    const stdout = execFileSync(process.execPath, [GATE, "--content-root", contentRoot, "--only=spine"], { encoding: "utf8" });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: (e.stdout ?? "").toString() };
  }
}

// ── schema discipline (the town-plan.test.mjs:105-118 pin, applied here) ───
test("spine-node schema declares no minimum/maximum anywhere — the G-* gates own every floor", () => {
  const found = [];
  (function walk(node, path) {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
    for (const [k, v] of Object.entries(node)) {
      if (k === "minimum" || k === "maximum" || k === "exclusiveMinimum" || k === "exclusiveMaximum")
        found.push(`${path}.${k}`);
      walk(v, `${path}.${k}`);
    }
  })(SCHEMA, "$");
  assert.deepEqual(found, [], `numeric bounds belong in the gate, not the schema: ${found.join(", ")}`);
});

test("spine-node schema is draft-07 with an $id", () => {
  assert.equal(SCHEMA.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(typeof SCHEMA.$id, "string");
});

// ── the committed table parses and joins ───────────────────────────────────
test("the committed 4-node table loads clean: 2 roots, depths legal, no load errors", () => {
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  assert.equal(spine.present, true);
  assert.deepEqual(spine.errors, []);
  assert.deepEqual(spine.nodes.map((n) => n.id), ["n-atlas", "n-cluster1", "n-playroot", "n-westsea"]);
  assert.deepEqual(spine.roots, ["n-atlas", "n-playroot"]);
  assert.deepEqual(spine.budgets.load, { maxNodes: 48, maxBytes: 262144 });
  assert.deepEqual(spine.budgets.coverage, { maxUnchecked: 4 });
  for (const n of spine.nodes) assert.equal(typeof TIER_DEPTH[n.tier], "number", n.id);
});
